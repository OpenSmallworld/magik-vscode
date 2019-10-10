'use strict';

const vscodeDebug = require('vscode-debugadapter');
const fs = require('fs');
const path = require('path');
const MagikDebuggerConnection = require('./magik-debugger-connection');

class MagikDebugSession extends vscodeDebug.DebugSession {
  constructor(vscode) {
    super();

    this._vscode = vscode;

    const clientURL = vscode.workspace.getConfiguration('magik-vscode')
      .debugClientURL;
    this._connection = new MagikDebuggerConnection(clientURL);
    // this._connection = new MagikDebuggerConnection();

    this._breakpoints = [];
    this._currentThreads = new Set();
    this._currentThreadId = undefined;

    this._variableHandles = new vscodeDebug.Handles();

    this._connection.onBreakpoint((e) => {
      // console.log('HIT BREAKPOINT', e.id, e.threadId);
      this._currentThreads.add(e.threadId);
      this._currentThreadId = e.threadId;
      this.sendEvent(new vscodeDebug.StoppedEvent('breakpoint', e.threadId));
    });

    this._connection.onThreadEvent((e) => {
      // console.log('THREAD EVENT', e);
      if (e.type === 'THREAD_STARTED') {
        this.sendEvent(new vscodeDebug.ThreadEvent('started', e.id));
      } else if (e.type === 'THREAD_ENDED') {
        this.sendEvent(new vscodeDebug.ThreadEvent('exited', e.id));
      }
    });

    this._connection.onClose(() => {
      // console.log('CLOSE');
      this.sendEvent(new vscodeDebug.TerminatedEvent());
    });
  }

  async disconnectRequest(response, args) {
    for (const id of Array.from(this._currentThreads)) {
      try {
        // eslint-disable-next-line
        await this._connection.resumeThread(id);
      } catch (e) {
        // Ignore
      }
    }

    await this._clearBreakpoints();
    await this._updateBreakpoints();

    this._currentThreads.clear();

    // this._connection.socket.destroy();

    this.sendResponse(response);

    // this.shutdown();
  }

  initializeRequest(response, args) {
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

  async _updateBreakpoints() {
    // console.log('UPDATE');
    const actualBreakpoints = [];
    let breakpointsResponse = [];

    try {
      breakpointsResponse = await this._connection.getBreakpoints();
    } catch (e) {
      console.log(e);
      this._vscode.window.showErrorMessage(e.message);
    }

    for (const data of breakpointsResponse) {
      // const source = new vscodeDebug.Source(
      //   path.basename(data.filename),
      //   data.filename
      // );
      const bp = new vscodeDebug.Breakpoint(true, data.line);
      bp.id = data.id;
      bp._name = data.name;
      bp._enabled = data.enabled;
      bp._sourcePath = data.filename;
      actualBreakpoints.push(bp);
    }

    this._breakpoints = actualBreakpoints;
  }

  async _clearBreakpoints(sourcePath) {
    for (const bp of this._breakpoints) {
      if (!sourcePath || bp._sourcePath === sourcePath) {
        // console.log('REMOVE BREAKPOINT', bp.id);
        try {
          // eslint-disable-next-line
          await this._connection.deleteBreakpoint(bp.id);
        } catch (e) {
          console.log(e);
        }
      }
    }
  }

  async setBreakPointsRequest(response, args) {
    // console.log('SET BREAKPOINTS', args);
    const sourcePath = args.source.path;
    const lines = args.lines || [];

    await this._clearBreakpoints(sourcePath);

    const sourceLines = this._getSourceLines(sourcePath);

    if (sourceLines) {
      const conditions = {};
      for (const bpData of args.breakpoints) {
        if (bpData.condition) {
          conditions[bpData.line] = bpData.condition;
        }
      }

      for (const lineNumber of lines) {
        const methodDef = this._getMethodDefinition(lineNumber, sourceLines);
        if (methodDef) {
          // console.log('ADD BREAKPOINT', methodDef, lineNumber);

          try {
            // eslint-disable-next-line
            const result = await this._connection.setBreakpoint(
              methodDef,
              lineNumber,
              sourcePath
            );

            if (conditions[lineNumber]) {
              // eslint-disable-next-line
              await this._connection.setCondition(
                result.id,
                conditions[lineNumber],
                'True'
              );
              // eslint-disable-next-line
              await this._connection.setBreakpointConditionalEnabled(
                result.id,
                true
              );
            }
          } catch (e) {
            // Can't set breakpoint - probably already set
            // Ignore
          }
        }
      }
    }

    await this._updateBreakpoints();

    // console.log('BREAKPOINTS', this._breakpoints);

    const newBreakpoints = [];
    for (const bp of this._breakpoints) {
      if (bp._sourcePath === sourcePath) {
        newBreakpoints.push(bp);
      }
    }

    // send back the actual breakpoint positions
    response.body = {
      breakpoints: newBreakpoints,
    };
    this.sendResponse(response);
  }

  async threadsRequest(response) {
    // console.log('THREADS');
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
        // console.log(id, threadInfo);

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

  async stackTraceRequest(response, args) {
    // console.log('STACK REQUEST', args);
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

    // FIXME
    const gis = 'C:/projects/hg/corerepo';

    for (let index = startFrame; index < end; index++) {
      const data = stackData[index];

      if (data.language === 'Magik') {
        // console.log(data);

        let source = '';
        try {
          // eslint-disable-next-line
          const sourceData = await this._connection.getSource(data.name);
          const sourcePath = sourceData.filename.replace(
            '$SMALLWORLD_GIS',
            gis
          );
          source = new vscodeDebug.Source(
            path.basename(sourcePath),
            sourcePath
          );
        } catch (e) {
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
    // console.log('SCOPES', args);
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
    // console.log('VARS', args);
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

        // console.log(localsResponse);

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
    // console.log('CONTINUE', args);
    try {
      await this._connection.resumeThread(args.threadId);
      this._currentThreads.delete(args.threadId);
    } catch (e) {
      this._vscode.window.showWarningMessage(e.message);
    }
    this.sendResponse(response);
  }

  async pauseRequest(response, args) {
    // console.log('PAUSE', args);
    try {
      await this._connection.suspendThread(args.threadId);
    } catch (e) {
      this._vscode.window.showWarningMessage(e.message);
    }
    this.sendResponse(response);
  }

  async nextRequest(response, args) {
    // 'step over'
    // console.log('NEXT', args);
    const threadId = args.threadId;

    try {
      await this._connection.step(threadId, 'long-over', 1);
      this.sendEvent(new vscodeDebug.StoppedEvent('step', threadId));
    } catch (e) {
      this._vscode.window.showWarningMessage(e.message);
    }
    this.sendResponse(response);
  }

  async stepInRequest(response, args) {
    // console.log('STEP IN', args);
    const threadId = args.threadId;

    try {
      await this._connection.step(threadId, 'long-line', 1);
      this.sendEvent(new vscodeDebug.StoppedEvent('step', threadId));
    } catch (e) {
      this._vscode.window.showWarningMessage(e.message);
    }
    this.sendResponse(response);
  }

  async stepOutRequest(response, args) {
    // console.log('STEP OUT', args);
    const threadId = args.threadId;

    try {
      await this._connection.step(threadId, 'long-out', 1);
      this.sendEvent(new vscodeDebug.StoppedEvent('step', threadId));
    } catch (e) {
      this._vscode.window.showWarningMessage(e.message);
    }
    this.sendResponse(response);
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
    // console.log('EVAL', args);
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
