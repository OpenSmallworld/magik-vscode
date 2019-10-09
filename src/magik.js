'use strict';

const vscode = require('vscode'); // eslint-disable-line
const Net = require('net');
const MagikVSCode = require('./magik-vscode');
const MagikLinter = require('./magik-linter');
const MagikDebug = require('./magik-debug');

class MagikConfigurationProvider {
  resolveDebugConfiguration(folder, config) {
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'magik') {
        config.type = 'magikDebug';
        config.request = 'launch';
        config.name = 'Magik Debug';
        config.program = './src/debug-adapter.js';
        config.stopOnEntry = true;
      }
    }
    return config;
  }
}

class MagikDebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(session, executable) {
    if (!this.server) {
      // start listening on a random port
      this.server = Net.createServer((socket) => {
        if (!this._debugSession) {
          this._debugSession = new MagikDebug(vscode);
          this._debugSession.setRunAsServer(true);
        }
        this._debugSession.start(socket, socket);
      }).listen(0);
    }

    // make VS Code connect to debug server
    return new vscode.DebugAdapterServer(this.server.address().port);

    // return new vscode.DebugAdapterServer(4711); // FOR DEBUGGING THE DEBUGGER
  }

  dispose() {
    if (this.server) {
      this.server.close();
    }
  }
}

function activate(context) {
  const magikVSCode = new MagikVSCode(context);
  new MagikLinter(magikVSCode, context); // eslint-disable-line

  const provider = new MagikConfigurationProvider();
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('magikDebug', provider)
  );

  const factory = new MagikDebugAdapterDescriptorFactory();
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('magikDebug', factory)
  );
  context.subscriptions.push(factory);
}

exports.activate = activate;
