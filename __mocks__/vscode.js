'use strict';

const languages = {
  createDiagnosticCollection: jest.fn(),
  registerOnTypeFormattingEditProvider: jest.fn()
};

const window = {
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  createTextEditorDecorationType: jest.fn(),
  activeTextEditor: {
    document: {
      uri: ''
    }
  }
};

const workspace = {
  getConfiguration: jest.fn(),
  workspaceFolders: [],
  onDidOpenTextDocument: jest.fn(),
  onDidSaveTextDocument: jest.fn(),
  onDidCloseTextDocument: jest.fn(),
  applyEdit: jest.fn()
};

const Uri = {
  file: f => f,
  parse: jest.fn()
};
const Range = jest.fn();
const Diagnostic = jest.fn();
const DiagnosticSeverity = {Error: 0, Warning: 1, Information: 2, Hint: 3};
const SymbolKind = {
  Class: 4,
  Method: 5,
  Property: 6,
  Function: 11,
  Variable: 12,
  Constant: 13
};

const debug = {
  onDidTerminateDebugSession: jest.fn(),
  startDebugging: jest.fn()
};

const commands = {
  executeCommand: jest.fn(),
  registerCommand: jest.fn()
};

class WorkspaceEdit {
  insert() {};
  replace() {};
};

const vscode = {
  languages,
  window,
  workspace,
  Uri,
  Range,
  Diagnostic,
  DiagnosticSeverity,
  SymbolKind,
  debug,
  commands,
  WorkspaceEdit
};

module.exports = vscode;
