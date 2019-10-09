'use strict';

const WebSocket = require('ws');
const Net = require('net');
const SlapProtocol = require('./debug/SlapProtocol');

class MagikDebuggerConnection {
  constructor(url) {
    this.readyFunctions = [];
    this.closeFunctions = [];

    this.currentRequestId = 0;
    this.requests = {};

    this.breakpointHandlers = [];
    this.threadHandlers = [];

    if (url === undefined || url === '') {
      // Connect directly to debug agent
      this.socket = new Net.Socket();
      this.slapConn = new SlapProtocol(this.socket, true);

      this.socket.on('connect', () => this.onConnect());

      this.socket.connect(
        32000,
        'localhost'
      );
    } else {
      this.socket = new WebSocket(url);

      this.socket.onmessage = (e) => this.onMessage(e);
      this.socket.onopen = () => this.onConnect();
    }

    this.socket.on('close', (e) => this.onClose(e));
  }

  onBreakpoint(func) {
    this.breakpointHandlers.push(func);
  }

  onThreadEvent(func) {
    this.threadHandlers.push(func);
  }

  onConnect() {
    if (this.slapConn) {
      this.breakpointHandlerID = this.slapConn.addBreakpointHandler((e) => {
        this.breakpointEvent(e);
      });
      this.threadEventHandlerID = this.slapConn.addThreadEventHandler((e) => {
        this.threadEvent(e);
      });
    }

    this.readyFunctions.forEach((fn) => fn());
  }

  onClose() {
    if (this.slapConn) {
      this.slapConn.removeBreakpointHandler(this.breakpointHandlerID);
      this.slapConn.removeThreadEventHandler(this.threadEventHandlerID);
    }

    this.closeFunctions.forEach((fn) => fn());
  }

  getThreadIds() {
    return this.sendMessage('getThreadIds').then((data) =>
      this.parseGetThreadIds(data)
    );
  }

  getThreadStack(id) {
    return this.sendMessage('getThreadStack', id).then((data) =>
      this.parseGetThreadStack(data, id)
    );
  }

  getThreadInfo(id) {
    return this.sendMessage('getThreadInfo', id);
  }

  suspendThread(id) {
    return this.sendMessage('suspendThread', id);
  }

  resumeThread(id) {
    return this.sendMessage('resumeThread', id);
  }

  getLocals(id, frame) {
    return this.sendMessage('getFrameLocals', id, frame).then((response) =>
      this.parseGetLocals(response)
    );
  }

  getSource(method) {
    return this.sendMessage('getSource', method);
  }

  parseGetThreadIds(data) {
    return data.threadIds;
  }

  parseGetThreadStack(data) {
    return data.frames;
  }

  parseGetLocals(data) {
    return data.locals;
  }

  breakpointEvent(e) {
    this.breakpointHandlers.forEach((fn) => fn(e));
  }

  threadEvent(e) {
    this.threadHandlers.forEach((fn) => fn(e));
  }

  evaluate(thread, frame, string) {
    return this.sendMessage('evaluate', thread, frame, string).then(
      (r) => r.result
    );
  }

  setBreakpoint(method, line, file) {
    return this.sendMessage('setBreakpoint', method, line, file);
  }

  getBreakpoints() {
    return this.sendMessage('getBreakpoints').then((r) => r.breakpoints);
  }

  deleteBreakpoint(id) {
    return this.sendMessage('deleteBreakpoint', id);
  }

  enableBreakpoint(id) {
    return this.sendMessage('enableBreakpoint', id);
  }

  disableBreakpoint(id) {
    return this.sendMessage('disableBreakpoint', id);
  }

  setBreakpointConditionalEnabled(id, e) {
    return this.sendMessage('setBreakpointConditionalEnabled', id, e);
  }

  setCondition(id, code, value) {
    return this.sendMessage('setCondition', id, code, value);
  }

  step(id, type, count) {
    return this.sendMessage('step', id, type, count);
  }

  onMessage(e) {
    const parsed = JSON.parse(e.data);

    if (parsed.breakpoint) {
      this.breakpointEvent(parsed.breakpoint);
      return;
    }
    if (parsed.threadEvent) {
      this.threadEvent(parsed.threadEvent);
      return;
    }
    if (parsed.error) {
      this.requests[parsed.requestId].reject(new Error(parsed.error));
    } else {
      this.requests[parsed.requestId].resolve(parsed);
    }

    delete this.requests[parsed.requestId];
  }

  sendMessage(command, ...args) {
    const requestId = ++this.currentRequestId;

    if (this.slapConn) {
      this.slapConn[command](...args)
        .then((response) => {
          const res = Object.assign(response || {}, {requestId});
          this.requests[requestId].resolve(res);
        })
        .catch((e) => {
          this.requests[requestId].reject(
            new Error(`${e.message} running ${command}`)
          );
        });
    } else {
      const message = JSON.stringify({
        requestId,
        command,
        args: [...args],
      });

      this.socket.send(message);
    }

    return new Promise((resolve, reject) => {
      this.requests[this.currentRequestId] = {resolve, reject};
    });
  }

  onReady(fn) {
    this.readyFunctions.push(fn);
  }

  onDisconnect(fn) {
    this.closeFunctions.push(fn);
  }
}

module.exports = MagikDebuggerConnection;
