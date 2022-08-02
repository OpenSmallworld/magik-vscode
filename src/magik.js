'use strict';

const vscode = require('vscode'); // eslint-disable-line
const Net = require('net');
const MagikVSCode = require('./magik-vscode');
const MagikLinter = require('./magik-linter');
const MagikDebug = require('./magik-debug');
const MagikSymbolProvider = require('./magik-symbols');
const MagikSession = require('./magik-session');
const MagikSemantics = require('./magik-semantics');

let magikVSCode;

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
  constructor(magikVSCode, symbolProvider) {
    this._magikVSCode = magikVSCode;
    this._symbolProvider = symbolProvider;
  }

  createDebugAdapterDescriptor(session, executable) {
    if (!this.server) {
      // start listening on a random port
      this.server = Net.createServer((socket) => {
        if (!this._debugSession) {
          this._debugSession = new MagikDebug(
            vscode,
            this._magikVSCode,
            this._symbolProvider
          );
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
      this._debugSession = undefined;
    }
  }
}

function activate(context) {
  const symbolProvider = new MagikSymbolProvider(vscode, context);

  magikVSCode = new MagikVSCode(symbolProvider, context);
  symbolProvider.magikVSCode = magikVSCode;

  new MagikLinter(magikVSCode, symbolProvider, context); // eslint-disable-line
  new MagikSemantics(magikVSCode, symbolProvider, context); // eslint-disable-line
  new MagikSession(context); // eslint-disable-line

  const configProvider = new MagikConfigurationProvider();
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      'magikDebug',
      configProvider
    )
  );

  const factory = new MagikDebugAdapterDescriptorFactory(
    magikVSCode,
    symbolProvider
  );
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('magikDebug', factory)
  );
  context.subscriptions.push(factory);
}


function deactivate() {
  magikVSCode.magikConsole.saveConsoleHistory();
}

module.exports = {
  activate,
  deactivate,
};
