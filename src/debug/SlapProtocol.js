'use strict';

var Promise = require('bluebird');

const EndianBuffer = require('./EndianBuffer');
const fs = Promise.promisifyAll(require('fs'));

const envvarReplacer = require('./envvarReplacer');

const SLAP_REQUEST_TYPES = {
  THREAD_LIST: 0,
  GET_THREAD_INFO: 1,
  SUSPEND_THREAD: 2,
  RESUME_THREAD: 3,
  GET_THREAD_STACK: 4,
  GET_LOCALS: 5,
  BREAKPOINT_SET: 6,
  BREAKPOINT_MODIFY: 7,
  EVALUATE: 8,
  SOURCE_FILE: 9,
  STEP: 10,

  END_MARKER: 0xffFFffFF,
};

const SLAP_MODIFY_BREAKPOINTS = {
  DELETE: 0,
  DISABLE: 1,
  ENABLE: 2,
};

const SLAP_EVENT = {
  EVENT_BREAKPOINT: 1,
  EVENT_THREAD_STARTED: 2,
  EVENT_THREAD_ENDED: 3,
  EVENT_STEP_COMPLETED: 4,
};

const SLAP_THREAD_STATES = [
  'new',
  'terminated',
  'runnable',
  'blocked',
  'waiting',
  'object wait',
  'parked',
  'sleeping'
];

const LOCAL_FLAGS = {
  VALUE_IS_ARG: 1,
  VALUE_INVALID: 2,
  VALUE_ANON: 4,
  VALUE_SLOT: 8,
  TYPE_INT: 'I'.charCodeAt(0),
  TYPE_SHORT: 'S'.charCodeAt(0),
  TYPE_CHAR: 'C'.charCodeAt(0),
  TYPE_BYTE: 'B'.charCodeAt(0),
  TYPE_BOOL: 'Z'.charCodeAt(0),
  TYPE_LONG: 'J'.charCodeAt(0),
  TYPE_FLOAT: 'F'.charCodeAt(0),
  TYPE_DOUBLE: 'D'.charCodeAt(0),
  TYPE_OBJ: 0xff,
  TYPE_NONE: 0,
};

const STEP_TYPES = {
  line:  0,
  out: 1,
  over: 2,
};

const STEP_UNTIL_MAGIK = 16;

const STATES = {
  WAITING_FOR_HANDSHAKE: 1,
  WAITING: 2,
  WAITING_FOR_1_RESPONSE: 3,
  WAITING_FOR_MULTIPLE_RESPONSES: 4,
};

const SLAP_REPLIES = {
  ERROR: 0,
  EVENT: 1,
  REPLY: 2,
};

const ERROR_MESSAGES = {
  1:'Unknown error',
  2:'Invalid line number',
  3:'Method not found',
  4:'Assist class not available',
  5:'Thread not suspended',
  6:'Request too short',
  7:'Unknown request',
  8:'Native Method',
  9:'No line number info',
  10:'Evaluation failed',
  10040:'Breakpoint already set at this location'
};

// Represents a connection with the magik debug agent
class SlapProtocol {
  // Connects to the debug agent via a provided socket
  constructor(socket, printVersion) {
    this.socket = socket;

    socket.on('connect', () => this.connect());
    socket.on('data', data => this.data(data));
    socket.on('close', () => this.closed());
    socket.on('error', e => this.socketError(e));

    this.messageQueue = [];
    this.breakpointHandlers = new Set();
    this.threadEventHandlers = new Set();
    this.state = STATES.WAITING_FOR_HANDSHAKE;
    this.version = printVersion;

    this.locked = false;
    this.lockedMessageQueue = [];

    this.breakpoints = [];
  }

  socketError(err) {
    // Catch ECONNRESET as Magik session closed and ECONNREFUSED as unable to establish connection
    if (err.code === 'ECONNRESET') {
      console.error('Connection to Magik Debug Agent Lost...');
      process.exit();
    } else if (err.code === 'ECONNREFUSED') {
      console.error(`Unable to Connect to Magik Debug Agent at ${err.address}:${err.port}`);
      process.exit();
    } else {
      throw err;
    }
  }

  closed() {
    console.error('socket closed :(');
    process.exit();
  }

  connect() {
    this.socket.setNoDelay();
    this.socket.write(SlapProtocol.DEBUG_CLIENT_ID, 'utf8');
  }

  data(data) {
    if (this.state === STATES.WAITING_FOR_HANDSHAKE) {
      const processed = this.processHandshake(data);
      this.haveDoneHandshake = true;
      this.isLittleEndian = processed.isLittleEndian;
      if (this.version) {
        console.log(`Connected to agent version ${processed.version}`);
      }
      this.version = processed.version;

      this.state = STATES.WAITING;

      this.nextRequest();
      return;
    }

    const message = new EndianBuffer(data, this.isLittleEndian);
    if (message.length <= 4) {
      return;
    }
    const dataLength = message.readUInt32(0);
    if (dataLength < message.length) {
      this.data(data.slice(0, dataLength));
      this.data(data.slice(dataLength));
      return;
    }

    const type = message.readUInt32(4);
    if (type === SLAP_REPLIES.ERROR) {
      if (this.onError) {
        const errorCode = message.readUInt32(12);
        let error;
        if (ERROR_MESSAGES[errorCode]) {
          error = new Error(`Agent error, ${ERROR_MESSAGES[errorCode]}`);
        } else {
          error = new Error(`Agent error, ${errorCode}`);
        }

        this.onError(error);
        this.state = STATES.WAITING;
      }
    } else if (type === SLAP_REPLIES.EVENT) {
      this.handleEvent(message);
      return;
    }

    switch (this.state) {
      case STATES.WAITING_FOR_1_RESPONSE:
        this.onResponse(data);
        this.state = STATES.WAITING;
        break;

      case STATES.WAITING_FOR_MULTIPLE_RESPONSES:
        if (!this.responseBuffer) {
          this.responseBuffer = [];
        }

        if (message.readUInt32(12) === SLAP_REQUEST_TYPES.END_MARKER) {
          this.onResponse(this.responseBuffer);
          this.responseBuffer = null;
          this.state = STATES.WAITING;
          break;
        }

        this.responseBuffer.push(data);
        break;
    }

    this.nextRequest();
  }

  handleEvent(message) {
    const eventType = message.readUInt32(8);

    switch (eventType) {
      case SLAP_EVENT.EVENT_BREAKPOINT:
        this.handleBreakpointEvent(message);
        break;
      case SLAP_EVENT.EVENT_THREAD_STARTED:
        this.handleThreadEvent(message, 'THREAD_STARTED');
        break;
      case SLAP_EVENT.EVENT_THREAD_ENDED:
        this.handleThreadEvent(message, 'THREAD_ENDED');
        break;
      case SLAP_EVENT.EVENT_STEP_COMPLETED:
        if (this.stepping) {
          this.stepping();
          this.stepping = null;
        } else {
          this.stepping = true;
        }
    }
  }

  handleConditionalBreakpoint(breakpoint, threadId) {
    return this.bypassLock(() => this.evaluate(threadId, 0, breakpoint.condition.code))
      .then(r => r.result === breakpoint.condition.value);
  }

  callBreakpointHandlers(event) {
    for (const func of this.breakpointHandlers) {
      func(event);
    }
  }

  handleBreakpointEvent(message) {
    const id = message.readUInt32(12);
    const threadId = message.readUInt32(16);
    const event = {id, threadId};

    const breakpoint = this.breakpoints.find(b => b.id === id);
    if (breakpoint && breakpoint.conditional && breakpoint.condition) {
      this.lock();
      this.handleConditionalBreakpoint(breakpoint, threadId).then(stop => {
        if (stop) {
          this.callBreakpointHandlers(event);
        } else {
          return this.bypassLock(() => this.resumeThread(threadId));
        }
      }).finally(() => this.unlock()).catch(e => {
        console.log(`Error while processing conditional breakpoint: ${e.message}`);
        this.callBreakpointHandlers(event);
      });
    } else {
      this.callBreakpointHandlers(event);
    }
  }

  addBreakpointHandler(func) {
    this.breakpointHandlers.add(func);
    return func;
  }

  removeBreakpointHandler(id) {
    this.breakpointHandlers.delete(id);
  }

  handleThreadEvent(message, type) {
    const id = message.readUInt32(12);
    const event = { type, id };

    for (const func of this.threadEventHandlers) {
      func(event);
    }
  }

  addThreadEventHandler(func) {
    this.threadEventHandlers.add(func);
    return func;
  }

  removeThreadEventHandler(func) {
    this.threadEventHandlers.delete(func);
  }

  processHandshake(data) {
    if (data.toString('utf8', 0, 16) != SlapProtocol.DEBUG_AGENT_ID) {
      throw new Error('Unknown water fowl');
    }

    const isLittleEndian = data.readInt8(16) === 1;
    const buffer = new EndianBuffer(data, isLittleEndian);
    const version = buffer.readUInt32(20);

    return {
      version,
      isLittleEndian,
    };
  }

  makeSlapString(string) {
    const buffer = new EndianBuffer(Buffer.alloc(string.length + 4), this.isLittleEndian);
    buffer.writeSlapString(0, string);
    return buffer.buffer;
  }

  makeRequest(id, rsv0, rsv1, extraData) {
    const header = new EndianBuffer(Buffer.alloc(16), this.isLittleEndian);
    header.writeUInt32(id, 4);
    header.writeUInt32(rsv0, 8);
    header.writeUInt32(rsv1, 12);

    const message = new EndianBuffer(Buffer.concat([header.buffer, extraData || Buffer.alloc(0)]), this.isLittleEndian);
    message.writeUInt32(message.length, 0);

    return message.buffer;
  }

  sendRequest(buffer) {
    this.socket.write(buffer);
  }

  addRequestToQueue(request) {
    if (this.locked) {
      this.lockedMessageQueue.push(request);
    } else {
      this.messageQueue.push(request);
    }
  }

  lock() {
    this.locked = true;
    this.lockedMessageQueue = this.lockedMessageQueue.concat(this.messageQueue);
    this.messageQueue = [];
  }

  unlock() {
    this.messageQueue = this.messageQueue.concat(this.lockedMessageQueue);
    this.lockedMessageQueue = [];
    this.locked = false;
    this.nextRequest();
  }

  bypassLock(fn) {
    this.locked = false;

    try {
      return fn();
    } finally {
      this.locked = true;
    }
  }

  pushRequest(buffer, nextState) {
    const ps = new Promise((resolve, reject) => {
      this.addRequestToQueue({
        buffer, nextState, resolve, reject,
      });

      this.nextRequest();
    });

    return ps;
  }

  nextRequest() {
    if (this.state !== STATES.WAITING || this.messageQueue.length === 0) {
      return;
    }

    const message = this.messageQueue.splice(0, 1)[0];

    this.sendRequest(message.buffer);
    this.state = message.nextState;
    this.onResponse = message.resolve;
    this.onError = message.reject;
  }

  processGetThreadIds(data) {
    const message = new EndianBuffer(data, this.isLittleEndian);
    const numThreads = message.readUInt32(12);
    const threadIds = [];

    for (let i = 0; i < numThreads; i++) {
      threadIds.push(message.readUInt32(16 + i * 4));
    }

    return {
      numThreads,
      threadIds,
    };
  }

  // Returns a promise which resolves with an object containing
  // {
  //   numThreads, (integer)
  //   threadIds, (an array of thread ids)
  // }
  getThreadIds() {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.THREAD_LIST, 0, 0);

    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(response => this.processGetThreadIds(response));
  }

  processGetThreadStack(data) {
    const frames = data.slice(1).map(b => {
      const buffer = new EndianBuffer(b, this.isLittleEndian);
      const level = buffer.readUInt32(12);
      const offset = buffer.readUInt32(16);
      const nameLength = buffer.readUInt32(16 + 4);
      const languageLength = buffer.readUInt32(16 + 8);

      const name = buffer.readString(16 + 12, nameLength);
      const language = buffer.readString(16 + 12 + nameLength, languageLength);

      return {
        offset, name, language, level,
      };
    });

    return {
      frames,
    };
  }

  // Given a thread ID, returns a promise which resolves to contain the stack frames.
  // An object of the form
  // {
  //   frames, (an array of Frame)
  // }
  //
  // And Frame is an object of the form
  // {
  //   offset, (integer)
  //   name, (string: method name)
  //   language, (string: currently either Java or Magik)
  //   level, (integer)
  // }
  getThreadStack(threadId) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.GET_THREAD_STACK, threadId, 1);

    return this.pushRequest(request, STATES.WAITING_FOR_MULTIPLE_RESPONSES)
      .then(response => this.processGetThreadStack(response));
  }

  // Will pause a thread with ID id returned by getTheadIds()
  suspendThread(id) {
    this.stopStepping = true;
    const request = this.makeRequest(SLAP_REQUEST_TYPES.SUSPEND_THREAD, id);
    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(() => null);
  }

  // Will resume a thread with ID id returned by getThreadIds()
  resumeThread(id) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.RESUME_THREAD, id);
    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(() => null);
  }

  processGetThreadInfo(data) {
    const message = new EndianBuffer(data, this.isLittleEndian);

    const flags = message.readUInt32(24);
    return {
      priority: message.readUInt32(16),
      daemon: !!message.readUInt32(20),
      state: SLAP_THREAD_STATES[flags & 0xff],
      name: message.readString(32, message.readUInt32(28)),
      flags: {
        suspended: !!(flags & 0x100),
        interrupted: !!(flags & 0x200),
        native: !!(flags & 0x400),
      },
    };
  }

  // Will return various data about the state of the thread.
  // {
  //   priority, (integer)
  //   daemon, (boolean)
  //   state, (string)
  //   name, (string)
  //   flags, ({suspended, interrupted, native (all booleans)})
  // }
  getThreadInfo(id) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.GET_THREAD_INFO, id);
    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(response => this.processGetThreadInfo(response));
  }

  processGetFrameLocals(data) {
    const locals = data.splice(1).map(local => {
      const buffer = new EndianBuffer(local, this.isLittleEndian);
      const nameLength = buffer.readUInt32(16);
      const name = buffer.readString(20, nameLength);
      const status = buffer.readUInt32(12);

      const type = (status & 0xff00) >> 8;
      let value;
      switch (type) {
        case LOCAL_FLAGS.TYPE_INT:
        case LOCAL_FLAGS.TYPE_SHORT:
        case LOCAL_FLAGS.TYPE_CHAR:
        case LOCAL_FLAGS.TYPE_BYTE:
          value = buffer.readUInt32(20 + nameLength);
          break;
        case LOCAL_FLAGS.TYPE_BOOL:
          value = !!buffer.readUInt32(20 + nameLength);
          break;
        case LOCAL_FLAGS.TYPE_DOUBLE:
          value = buffer.readDouble(20 + nameLength);
          break;
        case LOCAL_FLAGS.TYPE_OBJ:
          value = buffer.readString(20 + nameLength + 4, buffer.readUInt32(20 + nameLength));
          break;
        default:
          value = '<unknown>';
      }

      return {
        arg: !!(status & LOCAL_FLAGS.VALUE_IS_ARG),
        invalid: !!(status & LOCAL_FLAGS.VALUE_INVALID),
        anon: !!(status & LOCAL_FLAGS.VALUE_ANON),
        slot: !!(status & LOCAL_FLAGS.VALUE_SLOT),
        name,
        value,
      };
    });

    return {
      locals,
    };
  }

  // Returns an object containing the locals in a single stack frame provided by threadId and
  // stack level.
  //
  // Has the form:
  // {
  //   locals, (array of Local)
  // }
  //
  // Local:
  // {
  //   arg, boolean
  //   invalid, boolean
  //   anon, boolean
  //   name, string
  //   value, (string/boolean/number)
  // }
  getFrameLocals(threadId, stackLevel) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.GET_LOCALS, threadId, stackLevel);
    return this.pushRequest(request, STATES.WAITING_FOR_MULTIPLE_RESPONSES)
      .then(response => this.processGetFrameLocals(response));
  }

  processGetSource(data) {
    const message = new EndianBuffer(data, this.isLittleEndian);
    const filename = message.readSlapString(16);

    const actualFilename = envvarReplacer.replace(filename, process.env);
    let contents;
    try {
      contents = fs.readFileSync(actualFilename).toString('utf-8');
    } catch(e) {
      contents = `Not found in ${actualFilename}`;
    }

    return {filename, contents};
  }

  // Gets the source file of method. Returns
  // {
  //   filename, (string)
  // }
  getSource(method) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.SOURCE_FILE, 0, 0, this.makeSlapString(method));
    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(response => this.processGetSource(response));
  }

  processSetBreakpoint(data, breakpointData) {
    const message = new EndianBuffer(data, this.isLittleEndian);
    const id = message.readUInt32(12);

    this.breakpoints.push(Object.assign(breakpointData, {id, enabled: true, conditional: false}));

    return {id};
  }

  getBreakpoints() {
    return Promise.resolve({breakpoints: this.breakpoints});
  }

  // Sets a breakpoint on a method. Returns
  // {
  //   id, (integer)
  // }
  setBreakpoint(method, line, filename) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.BREAKPOINT_SET, 0, line || 0, this.makeSlapString(method));
    const breakpointData = { type: line ? 'line' : 'method', name: method };
    if (filename) {
      breakpointData.line = line;
      breakpointData.filename = filename;
    }

    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(response => this.processSetBreakpoint(response, breakpointData));
  }

  processModifyBreakpoint(id, newData) {
    const index = this.breakpoints.findIndex(b => b.id === id);
    this.breakpoints[index] = Object.assign(this.breakpoints[index], newData);
  }

  // Enables a given breakpoint
  enableBreakpoint(id) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.BREAKPOINT_MODIFY, id, SLAP_MODIFY_BREAKPOINTS.ENABLE);
    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(() => this.processModifyBreakpoint(id, {enabled: true}));
  }

  // Disables a given breakpoint
  disableBreakpoint(id) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.BREAKPOINT_MODIFY, id, SLAP_MODIFY_BREAKPOINTS.DISABLE);
    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(() => this.processModifyBreakpoint(id, {enabled: false}));
  }

  processDeleteBreakpoint(id) {
    const index = this.breakpoints.findIndex(b => b.id === id);
    this.breakpoints.splice(index, 1);
  }

  // Deletes a given breakpoint
  deleteBreakpoint(id) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.BREAKPOINT_MODIFY, id, SLAP_MODIFY_BREAKPOINTS.DELETE);
    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(() => this.processDeleteBreakpoint(id));
  }

  // Set the condition to the breakpoint with given id to be eval(code) == value
  setCondition(id, code, value) {
    if (!code) {
      return Promise.reject(new Error('Must enter some code'));
    }

    const breakpoint = this.breakpoints.find(b => b.id === id);
    if (breakpoint) {
      breakpoint.condition = {code, value: value || ''};
      return Promise.resolve({});
    } else {
      return Promise.reject(new Error('Cannot find breakpoint'));
    }
  }

  // Makes the breakpoint with a given id conditional
  setBreakpointConditionalEnabled(id, value) {
    const breakpoint = this.breakpoints.find(b => b.id === id);
    if (breakpoint) {
      breakpoint.conditional = !!value;
      return Promise.resolve({});
    } else {
      return Promise.reject(new Error('Cannot find breakpoint'));
    }
  }

  longStep(id, type) {
    this.stopStepping = false;

    return Promise.coroutine(function* () {
      const stack = yield this.getThreadStack(id);
      const initial = stack.frames.find(frame => frame.language === 'Magik');
      const startPoint = initial.name + initial.offset.toString();

      while (true) {
        yield this.step(id, type, 1);
        if (this.stopStepping) {
          break;
        }

        const newStack = yield this.getThreadStack(id);
        const topFrame = newStack.frames[0];
        if (topFrame.language === 'Magik' &&
          topFrame.offset !== 0 &&
          topFrame.name !== '<unknown exemplar><unknown method>') {
          const newPoint = topFrame.name + topFrame.offset.toString();
          if (startPoint !== newPoint) {
            break;
          }
        }
      }
    }.bind(this))();
  }

  processStep() {
    return new Promise(resolve => {
      if (this.stepping) {
        this.stepping = null;
        resolve();
      } else {
        this.stepping = resolve;
      }
    });
  }

  // Does a step of a paused thread with given id.
  // Type is 'line', 'out' or 'over', count is number of times to step
  //
  // If type is 'long-$TYPE' then will continue doing 1 step at a time until
  // the top of the stack is magik
  step(id, type, count) {
    if (type.startsWith('long-')) {
      return this.longStep(id, type.substr('long-'.length));
    }

    if (this.stepping) {
      return Promise.reject(new Error('Still stepping...'));
    }

    const request = this.makeRequest(SLAP_REQUEST_TYPES.STEP, id,
      (count << 16) | STEP_TYPES[type] | STEP_UNTIL_MAGIK);
    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(() => this.processStep());
  }

  processEvaluate(data) {
    const message = new EndianBuffer(data, this.isLittleEndian);
    const result = message.readSlapString(16);
    return {
      result,
    };
  }

  evaluate(thread, stack, code) {
    const request = this.makeRequest(SLAP_REQUEST_TYPES.EVALUATE, thread, stack,
      this.makeSlapString(code));
    return this.pushRequest(request, STATES.WAITING_FOR_1_RESPONSE)
      .then(data => this.processEvaluate(data));
  }
}

SlapProtocol.DEBUG_CLIENT_ID = 'DuckOnATricycle\0';
SlapProtocol.DEBUG_AGENT_ID  = 'SwanOnAUnicycle\0';

SlapProtocol.SLAP_REQUEST_TYPES = SLAP_REQUEST_TYPES;
SlapProtocol.STATES = STATES;

module.exports = SlapProtocol;
