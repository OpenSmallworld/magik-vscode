'use strict';

const vscode = require('vscode'); // eslint-disable-line
const os = require('os');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const magikUtils = require('./magik-utils');

const TEMP_FILENAME = 'vscode_temp.magik';
const CONSOLE_TEMP_FILENAME = 'vscode_console_temp.txt';
const OUTPUT_TEMP_FILENAME = 'vscode_output_temp.txt';

const MAGIK_PROMPT = '# Magik>';
const MAX_HISTORY = 200;

class MagikConsole {
  constructor(magikVSCode) {
    this.magikVSCode = magikVSCode;

    this._isCompiling = false;
    this._consoleHistory = [];
    this._consoleIndex = undefined;
    this._outputToConsole = false;

    this._monitorOutput();
  }

  _tempFile() {
    const tempDir = os.tmpdir();
    return path.join(tempDir, TEMP_FILENAME);
  }

  _consoleTempFile() {
    const tempDir = os.tmpdir();
    return path.join(tempDir, CONSOLE_TEMP_FILENAME);
  }

  _outputTempFile() {
    const tempDir = os.tmpdir();
    return path.join(tempDir, OUTPUT_TEMP_FILENAME);
  }

  isConsoleDoc(doc) {
    const fileName = path.basename(doc.fileName);
    return /^console(\s\d|\d).*?\.magik/.test(fileName);
  }

  consoleDocExists() {
    for (const doc of vscode.workspace.textDocuments) {
      if (!doc.isClosed && this.isConsoleDoc(doc)) {
        return true;
      }
    }
    return false;
  }

  _getConsoleDoc() {
    const docs = [];

    for (const doc of vscode.workspace.textDocuments) {
      if (!doc.isClosed && this.isConsoleDoc(doc)) {
        docs.push(doc);
      }
    }

    docs.sort((a, b) => b.fileName.localeCompare(a.fileName));

    if (docs.length > 0) {
      return docs[0];
    }
  }

  usingIntegratedTerminal() {
    return (
      vscode.workspace.getConfiguration('magik-vscode').magikProcessName ===
        '' && !this.usingConsoleDoc()
    );
  }

  showIntegratedTerminal() {
    if (
      vscode.workspace.getConfiguration('magik-vscode').magikProcessName === ''
    ) {
      vscode.commands.executeCommand('workbench.action.terminal.focus', {});
    }
  }

  usingConsoleDoc() {
    if (
      vscode.workspace.getConfiguration('magik-vscode')
        .enableOutputToConsoleFile
    ) {
      return this.consoleDocExists();
    }
    return false;
  }

  _revealLastRow(doc) {
    const editor = magikUtils.getDocEditor(doc);
    if (editor) {
      const lastRow = doc.lineCount - 1;
      const range = new vscode.Range(lastRow, 0, lastRow, 0);

      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range);
    }
  }

  _showLastRow(doc, preserveFocus = false) {
    const lastRow = doc.lineCount - 1;
    const range = new vscode.Range(lastRow, 0, lastRow, 0);

    vscode.window.showTextDocument(doc.uri, {
      selection: range,
      preview: false,
      preserveFocus,
    });
  }

  _showConsoleDoc() {
    if (
      vscode.workspace.getConfiguration('magik-vscode')
        .enableOutputToConsoleFile
    ) {
      const doc = this._getConsoleDoc();
      if (doc) {
        this._showLastRow(doc);
      }
    }
  }

  showConsole() {
    if (this.usingConsoleDoc()) {
      this._showConsoleDoc();
    } else if (
      vscode.workspace.getConfiguration('magik-vscode').magikProcessName === ''
    ) {
      vscode.commands.executeCommand('workbench.action.terminal.focus', {});
    }
  }

  async sendCommandToTerminal(procName, argString, additionalString) {
    let stringToSend;
    if (this.usingConsoleDoc()) {
      stringToSend = argString
        ? `vs_perform("${procName}", ${argString})`
        : `vs_perform("${procName}")`;
    } else {
      stringToSend = argString ? `${procName}(${argString})` : `${procName}()`;
    }

    if (additionalString) {
      stringToSend += `; ${additionalString}`;
    }

    await magikUtils.sendToTerminal(stringToSend);
  }

  _updateHistory(regionLines) {
    const consoleLines = [];
    const promptReg = new RegExp(`^${MAGIK_PROMPT}`);

    for (const regionLine of regionLines) {
      if (!promptReg.test(regionLine)) {
        consoleLines.push(regionLine);
      }
    }

    this._consoleHistory.push(consoleLines.join('\n'));
    if (this._consoleHistory.length > MAX_HISTORY) {
      this._consoleHistory.shift();
    }

    this._consoleIndex = undefined;
  }

  async _doReadConsoleTemp(doc, regionLines) {
    const consoleTempFile = this._consoleTempFile();

    this._updateHistory(regionLines);

    const edit = new vscode.WorkspaceEdit();
    const insertPos = new vscode.Position(doc.lineCount, 0);
    const result = fs.readFileSync(consoleTempFile).toString();

    edit.insert(doc.uri, insertPos, `\n${result}$\n\n${MAGIK_PROMPT} \n`);
    await vscode.workspace.applyEdit(edit);

    this._revealLastRow(doc);
  }

  async _doCompileText(doc, lines, regionLines) {
    const tempFile = this._tempFile();
    const consoleTempFile = this._consoleTempFile();

    for (let i = 0; i < lines.length; i++) {
      if (/^_package /.test(lines[i])) {
        lines[i] = '_package user';
      }
    }
    const output = lines.join('\r\n');

    fs.writeFileSync(tempFile, output);

    if (this._outputToConsole) {
      this._updateHistory(regionLines);
    } else {
      const watcher = chokidar.watch(consoleTempFile);
      watcher.on(
        'change',
        magikUtils.debounce(async () => {
          watcher.close();
          this._doReadConsoleTemp(doc, regionLines);
        }, 100)
      );
    }

    await magikUtils.sendToTerminal('vs_console_load()');
  }

  async compileText(doc, lines, regionLines) {
    this._isCompiling = true;
    this._doCompileText(doc, lines, regionLines);
    this._isCompiling = false;
  }

  async _showHistory(editor, newIndex) {
    if (this._consoleHistory.length === 0 || newIndex < 0) {
      return;
    }

    const doc = editor.document;
    const lastRow = doc.lineCount;
    const startLine = editor.selection.active.line || 0;

    for (let row = startLine; row < lastRow; row++) {
      const lineText = doc.lineAt(row).text;
      if (/^\s*\$/.test(lineText)) {
        return;
      }
    }

    let firstRow = 0;
    const promptReg = new RegExp(`^${MAGIK_PROMPT}\\s*$`);
    for (let row = startLine; row > -1; row--) {
      const lineText = doc.lineAt(row).text;
      if (promptReg.test(lineText)) {
        firstRow = row + 1;
        break;
      }
    }

    const edit = new vscode.WorkspaceEdit();
    const range = new vscode.Range(
      firstRow,
      0,
      lastRow - 1,
      doc.lineAt(lastRow - 1).text.length
    );
    let newText;

    if (newIndex > this._consoleHistory.length - 1) {
      // Remove current region
      this._consoleIndex = undefined;
      newText = '';
    } else {
      // Remove current region and replace with previous console region
      this._consoleIndex = newIndex;
      newText = this._consoleHistory[newIndex];
    }

    edit.replace(doc.uri, range, newText);
    await vscode.workspace.applyEdit(edit);
  }

  async showPrevious(editor) {
    if (this._consoleIndex === undefined) {
      this._consoleIndex = this._consoleHistory.length;
    }
    await this._showHistory(editor, this._consoleIndex - 1);
  }

  async showNext(editor) {
    if (this._consoleIndex === undefined) {
      this._consoleIndex = this._consoleHistory.length - 1;
    }
    await this._showHistory(editor, this._consoleIndex + 1);
  }

  async _addPrompt(doc) {
    const edit = new vscode.WorkspaceEdit();
    const lastRow = doc.lineCount - 1;
    const insertPos = new vscode.Position(lastRow + 1, 0);
    const prefix = doc.lineAt(lastRow).text === '' ? '' : '\n';

    const editor = magikUtils.getDocEditor(doc);
    let updateCurrentRow = false;
    if (editor) {
      const currentRow = editor.selection.active.line || 0;
      updateCurrentRow = doc.lineCount - 1 === currentRow;
    }

    edit.insert(doc.uri, insertPos, `${prefix}$\n\n${MAGIK_PROMPT} \n`);
    await vscode.workspace.applyEdit(edit);

    if (updateCurrentRow) {
      this._revealLastRow(doc);
    }
  }

  async _updateConsoleDoc() {
    if (this._isCompiling) return;

    if (
      !vscode.workspace.getConfiguration('magik-vscode')
        .enableOutputToConsoleFile
    ) {
      return;
    }

    const doc = this._getConsoleDoc();
    if (!doc) return;

    const outputTempFile = this._outputTempFile();
    let output;

    try {
      fs.accessSync(outputTempFile, fs.constants.R_OK);
      output = fs.readFileSync(outputTempFile).toString();
      fs.unlinkSync(outputTempFile);
    } catch (err) {
      return;
    }

    const outputLines = output.split('\n');
    if (outputLines[outputLines.length - 1] === '') {
      outputLines.pop();
    }
    const newOutput = outputLines.join('\n');

    const editor = magikUtils.getDocEditor(doc);
    let updateCurrentRow = false;
    if (editor) {
      const currentRow = editor.selection.active.line || 0;
      updateCurrentRow = doc.lineCount - 1 === currentRow;
    }

    const lastRow = doc.lineCount - 1;
    const edit = new vscode.WorkspaceEdit();
    const insertPos = new vscode.Position(lastRow + 1, 0);
    const prefix = doc.lineAt(lastRow).text === '' ? '' : '\n';

    edit.insert(doc.uri, insertPos, `${prefix}${newOutput}\n`);
    await vscode.workspace.applyEdit(edit);

    if (updateCurrentRow) {
      this._revealLastRow(doc);
    }

    if (this._promptTimer) {
      clearTimeout(this._promptTimer);
    }
    this._promptTimer = setTimeout(async () => {
      await this._addPrompt(doc);
    }, 500);
  }

  _monitorOutput() {
    const outputTempFile = this._outputTempFile();

    try {
      fs.unlinkSync(outputTempFile);
    } catch (err) {
      // Ignore error
    }

    this.checkOutputInterval = setInterval(async () => {
      let dev = this.magikVSCode.isDevLoaded();

      if (!dev) {
        await this.magikVSCode.symbolProvider.loadSymbols();
        dev = this.magikVSCode.isDevLoaded();
      }

      if (dev) {
        if (this.usingConsoleDoc()) {
          if (!this._outputToConsole) {
            this._outputToConsole = true;
            await magikUtils.sendToTerminal('vs_monitor_output(_true)');
          }
        } else if (this._outputToConsole) {
          this._outputToConsole = false;
          await magikUtils.sendToTerminal('vs_monitor_output(_false)');
        }
      }
    }, 2500);

    const watcher = chokidar.watch(outputTempFile);
    watcher.on(
      'add',
      magikUtils.debounce(async () => {
        await this._updateConsoleDoc();
      }, 100)
    );
    watcher.on(
      'change',
      magikUtils.debounce(async () => {
        await this._updateConsoleDoc();
      }, 100)
    );
  }

  restartMonitor() {
    // Force this.checkOutputInterval to send 'vs_monitor_output(_true)' to restart vs_output_timer in Magik.
    // Assumes a console file exists.
    this._outputToConsole = false;
  }
}

module.exports = MagikConsole;
