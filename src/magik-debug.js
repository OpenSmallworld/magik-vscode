'use strict';

const vscodeDebug = require('vscode-debugadapter');
const fs = require('fs');
const path = require('path');
const MagikDebuggerConnection = require('./magik-debugger-connection');

class MagikDebugSession extends vscodeDebug.DebugSession {
  constructor(vscode, symbolProvider) {
    super();

    this._vscode = vscode;
    this._symbolProvider = symbolProvider;

    const clientURL = vscode.workspace.getConfiguration('magik-vscode')
      .debugClientURL;
    this._connection = new MagikDebuggerConnection(clientURL);

    this._breakpoints = [];
    this._hitBreakpoints = {};
    this._currentThreads = new Set();
    this._currentThreadId = undefined;
    this._refreshBreakpointsRequired = false;

    this._variableHandles = new vscodeDebug.Handles();

    this._connection.onBreakpoint((e) => {
      const threadId = e.threadId;

      if (this._currentThreads.has(threadId)) {
        delete this._hitBreakpoints[threadId];
      } else {
        this._hitBreakpoints[threadId] = e.id;
        this._currentThreads.add(threadId);
      }

      this._currentThreadId = threadId;

      this.sendEvent(new vscodeDebug.StoppedEvent('breakpoint', threadId));
    });

    this._connection.onThreadEvent((e) => {
      if (e.type === 'THREAD_STARTED') {
        this.sendEvent(new vscodeDebug.ThreadEvent('started', e.id));
      } else if (e.type === 'THREAD_ENDED') {
        this.sendEvent(new vscodeDebug.ThreadEvent('exited', e.id));
      }
    });

    this._connection.onClose(() => {
      this.sendEvent(new vscodeDebug.TerminatedEvent());
    });

    // TODO - add command to remove all breakpoints and resume all threads.
  }

  async disconnectRequest(response) {
    // Resume threads and try to remove breakpoints from agent
    for (const id of Array.from(this._currentThreads)) {
      try {
        // eslint-disable-next-line
        await this._connection.resumeThread(id);
      } catch (e) {
        // Ignore
      }
    }

    await this._removeAllBreakpoints();

    this._currentThreads.clear();
    this._currentThreadId = undefined;
    this._hitBreakpoints = {};
    this._refreshBreakpointsRequired = true;

    this.sendResponse(response);
  }

  initializeRequest(response) {
    // build and return the capabilities of this debug adapter:
    response.body = response.body || {};
    response.body.supportsConfigurationDoneRequest = false;
    response.body.supportsFunctionBreakpoints = false;
    response.body.supportsConditionalBreakpoints = true;
    response.body.supportsEvaluateForHovers = true;

    this.sendResponse(response);

    this.sendEvent(new vscodeDebug.InitializedEvent());
  }

  _extractMethodDefinition(lineString) {
    const isMethod = lineString.match(
      /^\s*(_private)?\s*(_iter)?\s*_method\s+([\w!?]+\.[\w!?]+)\s*(\(.*|\s*\[.*)?/
    );

    if (!isMethod) {
      return null;
    }

    let methodName = isMethod[3];

    if (isMethod[4]) {
      if (isMethod[4].startsWith('(')) {
        methodName += '()';
      } else if (isMethod[4].startsWith('[')) {
        methodName += '[]';
      }
    }

    return methodName;
  }

  _getMethodDefinition(lineNumber, sourceLines) {
    // Find the method
    let method;
    for (let i = lineNumber; i > 0; i--) {
      method = this._extractMethodDefinition(sourceLines[i - 1]);
      if (method) break;
    }

    if (!method) return;

    // We need to find the package too
    let pkg = 'user';
    for (let i = lineNumber; i > 0; i--) {
      const match = sourceLines[i - 1].match(/^\s*_package\s+(\w+)/);
      if (match) {
        pkg = match[1];
        break;
      }
    }

    return `${pkg}:${method}`;
  }

  _getSourceLines(sourcePath) {
    return fs
      .readFileSync(sourcePath)
      .toString()
      .split('\n');
  }

  async _addBreakpoint(method, line, sourcePath) {
    let id;

    try {
      const result = await this._connection.setBreakpoint(
        method,
        line,
        sourcePath
      );
      id = result.id;
    } catch (e) {
      // Can't set breakpoint - probably already set
    }

    return id;
  }

  async _setCondition(id, condition) {
    try {
      if (condition) {
        await this._connection.setCondition(id, condition, 'True');
        await this._connection.setBreakpointConditionalEnabled(id, true);
      } else {
        await this._connection.setBreakpointConditionalEnabled(id, false);
      }
    } catch (e) {
      console.log(e);
    }
  }

  async _removeBreakpoint(id) {
    try {
      // eslint-disable-next-line
      await this._connection.deleteBreakpoint(id);
    } catch (e) {
      console.log(e);
    }
  }

  async _removeAllBreakpoints() {
    for (const bp of this._breakpoints) {
      // eslint-disable-next-line
      await this._removeBreakpoint(bp.id);
    }
  }

  // Compare breakpoints with agent breakpoints
  async _refreshBreakpoints() {
    if (!this._refreshBreakpointsRequired) {
      return;
    }

    const breakpointIds = [];
    let agentBreakpointData = [];
    const agentBreakpointIds = [];

    for (const bp of this._breakpoints) {
      breakpointIds.push(bp.id);
    }

    try {
      agentBreakpointData = await this._connection.getBreakpoints();

      for (const data of agentBreakpointData) {
        agentBreakpointIds.push(data.id);
      }
    } catch (e) {
      console.log(e);
      this._vscode.window.showErrorMessage(e.message);
      return;
    }

    for (const bp of this._breakpoints) {
      if (!agentBreakpointIds.includes(bp.id)) {
        // eslint-disable-next-line
        const id = await this._addBreakpoint(
          bp._method,
          bp.line,
          bp._sourcePath
        );
        if (id) {
          bp.id = id;

          if (bp._condition) {
            // eslint-disable-next-line
            await this._setCondition(id, bp._condition);
          }
        }
      }
    }

    for (const bp of this._breakpoints) {
      for (const agentData of agentBreakpointData) {
        if (
          bp._sourcePath === agentData.filename &&
          bp.line === agentData.line
        ) {
          const conditional = bp._condition !== undefined;
          const agentConditional = agentData.enabled && agentData.conditional;
          if (conditional !== agentConditional) {
            // eslint-disable-next-line
            await this._setCondition(bp.id, bp._condition);
          }
          break;
        }
      }
    }

    for (const id of agentBreakpointIds) {
      if (!breakpointIds.includes(id)) {
        // eslint-disable-next-line
        await this._removeBreakpoint(id);
      }
    }

    this._refreshBreakpointsRequired = false;

    // console.log('REFRESH BREAKPOINTS');
    // console.log('UI:');
    // console.log(this._breakpoints);
    // console.log('AGENT:');
    // const breakpointData = await this._connection.getBreakpoints();
    // console.log(breakpointData);
    // console.log('DONE REFRESH');
  }

  async setBreakPointsRequest(response, args) {
    const sourcePath = args.source.path;
    const lines = args.lines || [];

    // Defend against changing any breakpoints when a breakpoint is first hit
    // to avoid hanging the session.
    // Refresh the breakpoints when stepping starts.
    const updateAgent =
      this._hitBreakpoints[this._currentThreadId] === undefined;
    this._refreshBreakpointsRequired = !updateAgent;

    const oldSourceBreakpoints = [];
    for (const bp of this._breakpoints) {
      if (bp._sourcePath === sourcePath) {
        oldSourceBreakpoints.push(bp);
      }
    }

    const sourceLines = this._getSourceLines(sourcePath);

    if (sourceLines) {
      const conditions = {};
      for (const bpData of args.breakpoints) {
        if (bpData.condition) {
          conditions[bpData.line] = bpData.condition;
        }
      }

      for (const line of lines) {
        const method = this._getMethodDefinition(line, sourceLines);

        if (method) {
          const condition = conditions[line];
          let breakpoint;

          for (const [index, bp] of Object.entries(oldSourceBreakpoints)) {
            if (bp.line === line) {
              breakpoint = bp;
              oldSourceBreakpoints.splice(index, 1);
              break;
            }
          }

          if (!breakpoint) {
            let id;
            if (updateAgent) {
              // eslint-disable-next-line
              id = await this._addBreakpoint(
                method,
                line,
                sourcePath
              );
            }

            breakpoint = new vscodeDebug.Breakpoint(true, line);
            breakpoint.id = id;
            breakpoint._method = method;
            breakpoint._sourcePath = sourcePath;

            this._breakpoints.push(breakpoint);
          }

          if (breakpoint._condition !== condition) {
            if (updateAgent && breakpoint.id) {
              // eslint-disable-next-line
              await this._setCondition(breakpoint.id, condition);
            }
            breakpoint._condition = condition;
          }
        }
      }
    }

    // Remove old breakpoints for the source path
    for (const oldBreakpoint of oldSourceBreakpoints) {
      for (const [index, bp] of Object.entries(this._breakpoints)) {
        if (bp._sourcePath === sourcePath && bp.line === oldBreakpoint.line) {
          this._breakpoints.splice(index, 1);
          break;
        }
      }
      if (updateAgent && oldBreakpoint.id) {
        // eslint-disable-next-line
        await this._removeBreakpoint(oldBreakpoint.id);
      }
    }

    const sourceBreakpoints = [];
    for (const bp of this._breakpoints) {
      if (bp._sourcePath === sourcePath) {
        sourceBreakpoints.push(bp);
      }
    }

    // console.log('SET BREAKPOINTS', sourcePath);
    // console.log('UI:');
    // console.log(this._breakpoints);
    // console.log('AGENT:');
    // const breakpointData = await this._connection.getBreakpoints();
    // console.log(breakpointData);
    // console.log('DONE SET');

    response.body = {
      breakpoints: sourceBreakpoints,
    };
    this.sendResponse(response);
  }

  async threadsRequest(response) {
    const maxNameLength = 40;
    let threadIds = [];

    try {
      threadIds = await this._connection.getThreadIds();
    } catch (e) {
      console.log(e);
      this._vscode.window.showErrorMessage(e.message);
    }

    const threads = [];
    for (const id of threadIds) {
      let name;
      try {
        // eslint-disable-next-line
        const threadInfo = await this._connection.getThreadInfo(id);

        name = threadInfo.name;
        // if (name.length > maxNameLength) {
        //   name = `${threadInfo.name.substring(0, maxNameLength)}...`;
        // }
        name = `${name}   (${threadInfo.priority}) - ${threadInfo.state}`;
      } catch (e) {
        // No info - use default name
        name = `thread ${id}`;
      }

      const thread = new vscodeDebug.Thread(id, name);
      threads.push(thread);
    }

    response.body = {
      threads,
    };
    this.sendResponse(response);
  }

  async _getSourcePath(name) {
    const parts = name.split('.');
    const query = `^${parts[0]}$.^${parts[1]}$`;
    const symbols = await this._symbolProvider.getSymbols(query, false, 2);
    const classData = this._symbolProvider.classData[parts[0]];
    let sourcePath;

    if (symbols.length === 1) {
      sourcePath = symbols[0]._fileName;
    } else if (classData && classData.sourceFile) {
      sourcePath = classData.sourceFile;
    } else {
      const sourceData = await this._connection.getSource(name);
      if (sourceData) {
        sourcePath = sourceData.filename;
      }
    }

    if (sourcePath) {
      // FIXME
      const replacements = {
        $SMALLWORLD_GIS: 'C:/projects/hg/corerepo',
      };

      for (const [str1, str2] of Object.entries(replacements)) {
        sourcePath = sourcePath.replace(str1, str2);
      }
    }

    return sourcePath;
  }

  async stackTraceRequest(response, args) {
    const startFrame =
      typeof args.startFrame === 'number' ? args.startFrame : 0;
    const maxLevels = typeof args.levels === 'number' ? args.levels : 1000;
    const endFrame = startFrame + maxLevels;

    let stackData = [];
    try {
      stackData = await this._connection.getThreadStack(args.threadId);
    } catch (e) {
      console.log(e);
      this._vscode.window.showErrorMessage(e.message);
    }
    const stackFrames = [];
    const end = Math.min(endFrame, stackData.length);

    for (let index = startFrame; index < end; index++) {
      const data = stackData[index];

      if (data.language === 'Magik') {
        let source = '';

        try {
          // eslint-disable-next-line
          const sourcePath = await this._getSourcePath(data.name);

          if (sourcePath) {
            source = new vscodeDebug.Source(
              path.basename(sourcePath),
              sourcePath
            );
          }
        } catch (e) {
          // console.log(e);
        }

        if (source === '') {
          this._vscode.window.showWarningMessage(
            `Cannot find source for ${data.name}`
          );
        }

        const frame = new vscodeDebug.StackFrame(
          data.level,
          data.name,
          source,
          data.offset
        );

        stackFrames.push(frame);
      }
    }

    response.body = {
      stackFrames,
      totalFrames: stackFrames.length,
    };

    this.sendResponse(response);
  }

  scopesRequest(response, args) {
    const frameId = args.frameId;
    const scopes = [];

    this._currentFrameIndex = frameId;
    this._currentVars = undefined;

    scopes.push(
      new vscodeDebug.Scope(
        'Local',
        this._variableHandles.create(`local_${frameId}`),
        false
      )
    );

    scopes.push(
      new vscodeDebug.Scope(
        'Slots',
        this._variableHandles.create(`slots_${frameId}`),
        false
      )
    );

    response.body = {
      scopes,
    };
    this.sendResponse(response);
  }

  async variablesRequest(response, args) {
    let variables = [];
    const ref = args.variablesReference;
    const id = this._variableHandles.get(ref);

    if (id !== null) {
      const type = id.split('_')[0];

      if (!this._currentVars) {
        let localsResponse = [];
        try {
          localsResponse = await this._connection.getLocals(
            this._currentThreadId,
            this._currentFrameIndex
          );
        } catch (e) {
          console.log(e);
          this._vscode.window.showErrorMessage(e.message);
        }

        const local = [];
        const slots = [];

        for (const varData of localsResponse) {
          const nameParts = varData.name.split('!');
          let name =
            nameParts.length > 1
              ? `(${nameParts[0]}) ${nameParts[1]}`
              : varData.name;
          let priority = 2;

          if (name === '_self') {
            priority = 0;
          } else if (varData.arg) {
            name = `${name} (Arg)`;
            priority = 1;
          } else if (varData.slot) {
            priority = 3;
          }

          const newVar = {
            name,
            // type: 'string',
            value: varData.value,
            variablesReference: 0,
            priority,
          };

          if (varData.slot) {
            slots.push(newVar);
          } else {
            local.push(newVar);
          }
        }

        this._currentVars = {slots, local};
      }

      variables = this._currentVars[type];
    }

    variables.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.name.localeCompare(b.name);
      }
      return a.priority - b.priority;
    });

    response.body = {
      variables: variables,
    };
    this.sendResponse(response);
  }

  async continueRequest(response, args) {
    const threadId = args.threadId;

    delete this._hitBreakpoints[threadId];

    try {
      await this._connection.resumeThread(threadId);
      this._currentThreads.delete(threadId);
    } catch (e) {
      this._vscode.window.showErrorMessage(e.message);
    }
    this.sendResponse(response);

    this._refreshBreakpoints();
  }

  async pauseRequest(response, args) {
    const threadId = args.threadId;

    this._currentThreads.add(threadId);
    this._currentThreadId = threadId;

    try {
      await this._connection.suspendThread(threadId);
    } catch (e) {
      this._vscode.window.showErrorMessage(e.message);
    }
    this.sendResponse(response);
  }

  async nextRequest(response, args) {
    // Step Over
    const threadId = args.threadId;

    delete this._hitBreakpoints[threadId];

    try {
      await this._connection.step(threadId, 'long-over', 1);
      this.sendEvent(new vscodeDebug.StoppedEvent('step', threadId));
    } catch (e) {
      this._vscode.window.showWarningMessage(e.message);
    }
    this.sendResponse(response);

    this._refreshBreakpoints();
  }

  async stepInRequest(response, args) {
    const threadId = args.threadId;

    delete this._hitBreakpoints[threadId];

    try {
      await this._connection.step(threadId, 'long-line', 1);
      this.sendEvent(new vscodeDebug.StoppedEvent('step', threadId));
    } catch (e) {
      this._vscode.window.showWarningMessage(e.message);
    }
    this.sendResponse(response);

    this._refreshBreakpoints();
  }

  async stepOutRequest(response, args) {
    const threadId = args.threadId;

    delete this._hitBreakpoints[threadId];

    try {
      await this._connection.step(threadId, 'long-out', 1);
      this.sendEvent(new vscodeDebug.StoppedEvent('step', threadId));
    } catch (e) {
      this._vscode.window.showWarningMessage(e.message);
    }
    this.sendResponse(response);

    this._refreshBreakpoints();
  }

  async _eval(threadId, frameId, string) {
    let reply = '';
    try {
      reply = await this._connection.evaluate(threadId, frameId, string);
    } catch (e) {
      // Ignore
    }
    return reply;
  }

  async _slotName(threadId, frameId, string) {
    const testStrings = [string, `${string}?`];

    for (const test of testStrings) {
      // eslint-disable-next-line
      const result = await this._eval(
        threadId,
        frameId,
        `_self.sys!has_slot(:${test})`
      );
      if (result === 'True') {
        return test;
      }
    }
  }

  async evaluateRequest(response, args) {
    const frameId = args.frameId;
    const expression = args.expression;
    let reply;

    // Note: Don't call methods on _self - this will hang the debug agent

    if (args.context === 'repl') {
      reply = await this._eval(this._currentThreadId, frameId, expression);
    } else if (args.context === 'hover') {
      let evalString;

      if (expression.startsWith('.') || expression.startsWith('_self.')) {
        // Test if slot name
        const slotName = await this._slotName(
          this._currentThreadId,
          frameId,
          expression.split('.')[1]
        );

        if (slotName) {
          evalString = `_self.sys!slot(:${slotName})`;
        }
      } else if (
        !expression.startsWith('_super.') &&
        !expression.startsWith('_clone')
      ) {
        evalString = expression;
      }

      if (evalString) {
        reply = await this._eval(
          this._currentThreadId,
          frameId,
          `${evalString}.vs_print_string`
        );
      }
    }

    response.body = {
      result: reply || `Can not evaluate: '${expression}'`,
      variablesReference: 0,
    };
    this.sendResponse(response);
  }
}

module.exports = MagikDebugSession;
