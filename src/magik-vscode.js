'use strict';

const vscode = require('vscode'); // eslint-disable-line
const fs = require('fs');
const os = require('os');
const path = require('path');
const magikUtils = require('./magik-utils');
const magikVar = require('./magik-variables');

class MagikVSCode {
  constructor(symbolProvider, context) {
    this.openFiles = [];
    this.currentSymbols = [];
    this.resolveSymbols = true;

    this.symbolProvider = symbolProvider;

    this._initialise(context);
  }

  _registerFiles(context) {
    // No api for open editors
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          const fileName = editor.document.fileName;
          const index = this.openFiles.indexOf(fileName);
          if (index === -1) {
            this.openFiles.push(fileName);
          } else {
            this.openFiles.splice(index, 1);
          }
        }
      })
    );
  }

  _initialise(context) {
    const magikFile = {
      scheme: 'file',
      language: 'magik',
    };
    const commandConfig = [
      ['goto', this._goto],
      ['compileMethod', this._compileMethod],
      ['compileFile', this._compileFile],
      ['loadModule', this._loadModule],
      ['compileSelection', this._compileSelection],
      ['refreshSymbols', this._refreshSymbols],
      ['gotoPreviousDefinition', this._gotoPreviousDefinition],
      ['gotoNextDefinition', this._gotoNextDefinition],
      ['selectRegion', this._selectRegion],
      ['runTest', this._runTest],
      ['compileExtensionMagik', this._compileExtensionMagik],
      ['newBuffer', this._newMagikBuffer],
      ['gotoClipboardText', this._gotoClipboardText],
    ];

    for (const [name, func] of commandConfig) {
      const disposable = vscode.commands.registerCommand(`magik.${name}`, () =>
        func.call(this)
      );
      context.subscriptions.push(disposable);
    }

    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(magikFile, this)
    );

    context.subscriptions.push(
      vscode.languages.registerReferenceProvider(magikFile, this)
    );

    context.subscriptions.push(
      vscode.languages.registerDocumentSymbolProvider(magikFile, this)
    );

    context.subscriptions.push(
      vscode.languages.registerWorkspaceSymbolProvider(this)
    );

    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(magikFile, this)
    );

    context.subscriptions.push(
      vscode.languages.registerSignatureHelpProvider(
        magikFile,
        this,
        '(',
        '<',
        ' ',
        ','
      )
    );

    this._registerFiles(context);
  }

  _sendToTerminal(textToSend) {
    const command = `${textToSend}\u000D`;

    if (
      vscode.workspace.getConfiguration('magik-vscode').enableAutoScrollToPrompt
    ) {
      vscode.commands.executeCommand(
        'workbench.action.terminal.scrollToBottom',
        {}
      );
    }

    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
      text: command,
    });
  }

  _compileText(lines) {
    const tempFile = path.join(os.tmpdir(), 'vscode_temp.magik');
    const output = lines.join('\r\n');

    fs.writeFileSync(tempFile, output);

    this._sendToTerminal('vs_load()');
  }

  _compileFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const {fileName} = doc;

    if (doc.isDirty) {
      const lines = [`# Output:Loading file '${fileName}'...`];
      const linesLength = doc.lineCount;

      for (let i = 0; i < linesLength; i++) {
        lines.push(doc.lineAt(i).text);
      }
      this._compileText(lines);
    } else if (path.extname(fileName) === '.magik') {
      const command = `load_file("${fileName}")`;

      this._sendToTerminal(command);
    }
  }

  _loadModule() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const {fileName} = doc;

    if (path.extname(fileName) === '.magik') {
      const name = path.basename(fileName, '.magik');
      const searchPath = path.dirname(fileName);
      const command = `load_file_name("${name}", "${searchPath}", _true)`;

      this._sendToTerminal(command);
    }
  }

  _compileSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const selection = editor.selection;

    if (!selection.empty) {
      const text = doc.getText(
        new vscode.Range(selection.start, selection.end)
      );
      const packageName = magikUtils.getPackageName(doc);
      const lines = [
        '#% text_encoding = iso8859_1',
        `_package ${packageName}`,
        '$',
        '# Output:Loading selection...',
      ];
      lines.push(text);
      this._compileText(lines);
    }
  }

  _compileMethod() {
    const lines = magikUtils.currentRegion(true).lines;
    if (!lines) {
      return this._compileRegion();
    }

    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;
    const packageName = magikUtils.getPackageName(doc);

    const parts = lines[0].split('.');
    const className = parts[0]
      .split(/\s/)
      .slice(-1)[0]
      .trim();
    let methodName;

    if (parts.length > 1) {
      methodName = parts[1].trim();
      let index = methodName.search(magikUtils.INVALID_CHAR);
      if (index === -1) index = methodName.length;
      methodName = methodName.slice(0, index);
      if (parts[1].includes('(')) {
        methodName += '()';
      } else if (parts[1].includes('<<')) {
        methodName += '<<';
      }
    }

    lines.unshift(`# Output:Loading ${className}.${methodName}...`);
    lines.unshift('$');
    lines.unshift(`_package ${packageName}`);
    lines.unshift('#% text_encoding = iso8859_1');
    lines.push('$');

    // Set source file
    if (methodName) {
      lines.push('_block');
      lines.push(`_local meth << ${className}.method(:|${methodName}|)`);
      lines.push(
        `_if meth _isnt _unset _then meth.compiler_info[:source_file] << "${
          doc.fileName
        }" _endif`
      );
      lines.push('_endblock');
      lines.push('$');
    }

    this._compileText(lines);
  }

  _compileRegion() {
    const region = magikUtils.currentRegion(false);
    const lines = region.lines;
    if (!lines) return;

    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;
    const fileName = path.basename(doc.fileName);
    const packageName = magikUtils.getPackageName(doc);

    lines.unshift(
      `# Output:Loading ${fileName}:${region.firstRow + 1}-${region.lastRow +
        1}...`
    );
    lines.unshift('$');
    lines.unshift(`_package ${packageName}`);
    lines.unshift('#% text_encoding = iso8859_1');
    lines.push('$');

    this._compileText(lines);
  }

  _compileExtensionMagik() {
    const ext = vscode.extensions.getExtension('GE-Smallworld.magik-vscode');
    if (ext) {
      const fileName = path.join(ext.extensionPath, 'vscode_dev.magik');
      const command = `load_file("${fileName}")`;

      this._sendToTerminal(command);
    }
  }

  async _newMagikBuffer() {
    const tempDir = os.tmpdir();
    let tempFile = path.join(tempDir, 'buffer1.magik');
    let count = 2;

    while (fs.existsSync(tempFile)) {
      tempFile = path.join(tempDir, `buffer${count}.magik`);
      count++;
    }

    fs.writeFileSync(tempFile, '');

    await vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.file(tempFile)
    );
  }

  async _gotoClipboardText() {
    // To search for selection from the terminal ensure copyOnSelection is set to true:
    // "terminal.integrated.copyOnSelection": true

    const clipboardText = await vscode.env.clipboard.readText();
    await this._gotoText(clipboardText);
  }

  async _gotoText(selectedText) {
    if (selectedText.length === 0) return;

    const text = selectedText.trim();

    // TODO - can't pass text as arg!
    // await vscode.commands.executeCommand(
    //   'workbench.action.showAllSymbols',
    //   text
    // );

    let query;
    let command;

    const match = text.match(/\s\.{2,}\s/);
    if (match) {
      const textSplit = text.split(match[0]);
      query = `^${textSplit[1]}$.^${textSplit[0]}$`;
      command = `vs_goto("^${textSplit[0]}$", "${textSplit[1]}")`;
    } else {
      const textSplit = text.split('.');
      if (textSplit.length === 2) {
        query = `^${textSplit[0]}$.^${textSplit[1]}`;
        command = `vs_goto("^${textSplit[1]}", "${textSplit[0]}")`;
      } else {
        query = `^${text}`;
        command = `vs_goto("^${text}")`;
      }
    }

    const symbols = await this.symbolProvider.getSymbols(query, undefined, 2);

    if (symbols.length === 1) {
      const resSymbol = this.resolveWorkspaceSymbol(symbols[0]);
      if (resSymbol) {
        const range = resSymbol.location.range;
        await vscode.commands.executeCommand(
          'vscode.open',
          resSymbol.location.uri
        );
        const editor = vscode.window.activeTextEditor;
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        return;
      }
    }

    vscode.commands.executeCommand('workbench.action.terminal.focus', {});
    this._sendToTerminal(command);
  }

  // TODO - handle definitions across multiple lines
  _findDefinition(fileName, word) {
    const lines = fs
      .readFileSync(fileName)
      .toString()
      .split('\n'); // TODO replace this
    const lineCount = lines.length;

    const methodTest = new RegExp(
      `(^|\\s+)_method\\s+.+\\.\\s*${word}\\s*($|\\(|\\[|<<)`
    );
    const defineTest = new RegExp(
      `\\.\\s*(define_slot_access|define_shared_constant|def_property|define_property|define_shared_variable)\\s*\\(\\s*:${word}($|[^a-zA-Z0-9_?!])`
    );

    for (let row = 0; row < lineCount; row++) {
      const text = lines[row];
      let index = text.search(methodTest);

      if (index === -1) {
        index = text.search(defineTest);
      }
      if (index !== -1) {
        index = text.indexOf(word, index);
        const range = new vscode.Range(row, index, row, index + word.length);
        return new vscode.Location(vscode.Uri.file(fileName), range);
      }
    }
  }

  // TODO - only looking in current file
  provideReferences(doc, pos) {
    const locs = [];
    const current = magikUtils.currentWord(doc, pos);
    if (current === '') return locs;

    const lineCount = doc.lineCount;
    const uri = doc.uri;

    for (let row = 0; row < lineCount; row++) {
      const text = doc.lineAt(row).text;
      const index = text.indexOf(current);

      if (index !== -1) {
        const range = new vscode.Range(row, index, row, index + current.length);
        const loc = new vscode.Location(uri, range);
        locs.push(loc);
      }
    }

    return locs;
  }

  _getDefinitionSymbol(doc, row, text, defTest) {
    let index = text.search(defTest.test);
    if (index === -1) return;

    const quoteIndex = text.indexOf('"');
    if (quoteIndex > -1 && quoteIndex < index) return;

    let className;
    let methodName;

    if (defTest.type === vscode.SymbolKind.Method) {
      const res = magikUtils.getClassAndMethodName(text);
      if (res.methodName) {
        className = res.className;
        methodName = res.methodName;
      }
    } else {
      const pos = new vscode.Position(row, index + 1);
      const next = magikUtils.nextWord(doc, pos);
      if (next) {
        className = magikUtils.currentClassName(doc, pos);
        methodName = next;
      }
    }

    if (className) {
      index = text.indexOf(methodName);
      const range = new vscode.Range(
        row,
        index,
        row,
        index + methodName.length
      );
      const sym = new vscode.SymbolInformation(
        methodName,
        defTest.type,
        range,
        doc.uri,
        className
      );
      return sym;
    }
  }

  _gotoPreviousDefinition() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const startLine = editor.selection.active.line - 1;
    const testsLength = magikUtils.DEFINITION_TESTS.length;

    for (let row = startLine; row > 0; row--) {
      const text = doc.lineAt(row).text;

      if (text.trim().length > 10) {
        for (let i = 0; i < testsLength; i++) {
          const defTest = magikUtils.DEFINITION_TESTS[i];
          const sym = this._getDefinitionSymbol(doc, row, text, defTest);
          if (sym) {
            const range = sym.location.range;
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(range); // , vscode.TextEditorRevealType.InCenter);
            return;
          }
        }
      }
    }
  }

  _gotoNextDefinition() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const startLine = editor.selection.active.line + 1;
    const lineCount = doc.lineCount;
    const testsLength = magikUtils.DEFINITION_TESTS.length;

    for (let row = startLine; row < lineCount; row++) {
      const text = doc.lineAt(row).text;

      if (text.trim().length > 10) {
        for (let i = 0; i < testsLength; i++) {
          const defTest = magikUtils.DEFINITION_TESTS[i];
          const sym = this._getDefinitionSymbol(doc, row, text, defTest);
          if (sym) {
            const range = sym.location.range;
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(range); // , vscode.TextEditorRevealType.InCenter);
            return;
          }
        }
      }
    }
  }

  _selectRegion() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const region = magikUtils.currentRegion();
    if (!region.lines) return;

    const doc = editor.document;
    let firstRow = region.firstRow;
    let lastRow = region.lastRow;
    let lastCol;

    for (let row = firstRow - 1; row > -1; row--) {
      const lineText = doc.lineAt(row).text;

      if (lineText.startsWith('_pragma')) {
        firstRow = row;
        break;
      }
      if (lineText.startsWith('$')) {
        break;
      }

      const lineTextTrimmed = lineText.trim();
      if (lineTextTrimmed.length > 0 && !lineTextTrimmed.startsWith('#')) {
        break;
      }
    }

    if (lastRow !== doc.lineCount - 1) {
      const nextLine = doc.lineAt(lastRow + 1).text;
      if (nextLine.startsWith('$')) {
        lastRow++;
        lastCol = nextLine.length;
      }
    }

    if (lastCol === undefined) {
      lastCol = doc.lineAt(lastRow).text.length;
    }

    const range = new vscode.Range(firstRow, 0, lastRow, lastCol);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range);
  }

  // TODO - currently only looking for definitions on one line
  provideDocumentSymbols(doc) {
    const symbols = [];
    const testsLength = magikUtils.DEFINITION_TESTS.length;
    const lineCount = doc.lineCount;

    for (let row = 0; row < lineCount; row++) {
      const text = doc.lineAt(row).text;

      if (text.trim().length > 10) {
        for (let i = 0; i < testsLength; i++) {
          const defTest = magikUtils.DEFINITION_TESTS[i];
          const sym = this._getDefinitionSymbol(doc, row, text, defTest);
          if (sym) {
            symbols.push(sym);
            break;
          }
        }
      }
    }

    this.currentSymbols = symbols;

    return symbols;
  }

  async provideWorkspaceSymbols(query) {
    return this.symbolProvider.getSymbols(query);
  }

  resolveWorkspaceSymbol(sym) {
    const index = sym._methodName.search(magikUtils.INVALID_CHAR);
    if (index !== -1) {
      sym._methodName = sym._methodName.slice(0, index);
    }
    if (this.resolveSymbols) {
      const loc = this._findDefinition(sym._fileName, sym._methodName);
      if (loc) {
        sym.location = loc;
        return sym;
      }
    } else {
      return sym;
    }
  }

  _getCurrentReceiver(doc, pos, previousWord) {
    let className;

    if (['_self', '_super', '_clone'].includes(previousWord)) {
      className = magikUtils.currentClassName(doc, pos);
    } else if (this.symbolProvider.classData[previousWord]) {
      className = previousWord;
    } else {
      const currentText = doc.lineAt(pos.line).text;
      const match = /_super\s*\(\s*[a-zA-Z0-9_?!]+\s*\)\s*\.\s*[a-zA-Z0-9_?!]*$/.exec(
        currentText.substr(0, pos.character)
      );
      if (match) {
        className = match[0]
          .split('(')[1]
          .split(')')[0]
          .trim();
      } else {
        const region = magikUtils.currentRegion(false, pos.line);
        const lines = region.lines;
        const firstRow = region.firstRow;
        const end = pos.line - firstRow + 1;
        const assignedVars = {};

        for (let i = 0; i < end; i++) {
          const row = firstRow + i;
          const lineText = lines[i];

          magikVar.findAssignedVariables(lines, firstRow, i, assignedVars);
          magikVar.findLocalVariables(
            lineText,
            row,
            assignedVars,
            this.symbolProvider.classNames,
            this.symbolProvider.classData,
            this.symbolProvider.globals,
            []
          );
        }

        const varData = assignedVars[previousWord];
        if (varData) {
          className = varData.className;
        }
      }
    }

    return className;
  }

  async _getCurrentDefinitionSymbol(doc, pos) {
    let currentWord = magikUtils.currentWord(doc, pos);
    if (!currentWord) return {};

    const text = doc.lineAt(pos.line).text;
    const start = text.indexOf(currentWord, pos.character - currentWord.length);

    currentWord = magikUtils.getMethodName(text, currentWord, start);

    const previousWord = magikUtils.previousWord(doc, pos);
    let className = previousWord;
    let symbol;

    if (previousWord) {
      const inherit = previousWord === '_super';
      const receiverClassName = this._getCurrentReceiver(
        doc,
        pos,
        previousWord
      );
      if (receiverClassName) className = receiverClassName;

      let query = `^${className}$.^${currentWord}$`;
      let symbols = await this.symbolProvider.getSymbols(query, inherit, 2);

      if (symbols.length === 0) {
        query = `^${currentWord}$`;
        symbols = await this.symbolProvider.getSymbols(query, undefined, 2);
      }

      if (symbols.length === 1) {
        const resSymbol = this.resolveWorkspaceSymbol(symbols[0]);
        if (resSymbol) {
          symbol = resSymbol;
        }
      }
    }

    return {
      symbol,
      className,
      currentWord,
      previousWord,
    };
  }

  async _goto() {
    let editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const selection = editor.selection;

    if (!selection.empty) {
      const selectedText = doc.getText(
        new vscode.Range(selection.start, selection.end)
      );
      if (/\s\.{2,}\s/.test(selectedText)) {
        return this._gotoText(selectedText);
      }
    }

    const pos = selection.active;
    const def = await this._getCurrentDefinitionSymbol(doc, pos);

    if (!def.currentWord) return;

    if (def.symbol) {
      const range = def.symbol.location.range;
      await vscode.commands.executeCommand(
        'vscode.open',
        def.symbol.location.uri
      );
      editor = vscode.window.activeTextEditor;
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      return;
    }

    const text = doc.lineAt(pos.line).text;
    const start = text.indexOf(
      def.currentWord,
      pos.character - def.currentWord.length
    );

    let command;
    // Test for _super(classname)
    const match = text
      .substr(0, start)
      .match(/_super\s*\(\s*[a-zA-Z0-9_?!]+\s*\)\s*\.\s*$/);
    if (match) {
      let className = '';
      if (match[0].indexOf('_super(') !== -1) {
        className = match[0]
          .split('_super(')[1]
          .split(')')[0]
          .trim();
      } else if (match[0].indexOf('_super (') !== -1) {
        className = match[0]
          .split('_super (')[1]
          .split(')')[0]
          .trim();
      }
      command = `vs_goto("^${def.currentWord}$", "${className}")`;
    } else {
      const inherit = def.previousWord === '_super' ? '_true' : '_false';
      command = `vs_goto("^${def.currentWord}$", "${
        def.className
      }", ${inherit})`;
    }

    vscode.commands.executeCommand('workbench.action.terminal.focus', {});

    this._sendToTerminal(command);
  }

  _refreshSymbols() {
    this._sendToTerminal('vs_save_symbols()');
  }

  async provideDefinition(doc, pos) {
    const def = await this._getCurrentDefinitionSymbol(doc, pos);

    if (def.symbol) {
      return def.symbol.location;
    }

    if (!['_self', '_super', '_clone'].includes(def.previousWord)) return;

    // Revert to checking some files...

    const current = magikUtils.currentWord(doc, pos);
    const currentFileName = doc.fileName;
    const currentDir = path.dirname(currentFileName);
    const doneFileNames = [];
    let loc;

    // Check current file
    loc = this._findDefinition(currentFileName, current);
    if (loc) return loc;
    doneFileNames.push(currentFileName);

    // Check other open files
    for (let i = 0; i < this.openFiles.length; i++) {
      const fileName = this.openFiles[i];

      if (
        !doneFileNames.includes(fileName) &&
        path.extname(fileName) === '.magik'
      ) {
        loc = this._findDefinition(fileName, current);
        if (loc) return loc;
        doneFileNames.push(fileName);
      }
    }

    // Check other magik files from the directory
    const files = this._getMagikFilesInDirectory(currentDir);

    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];

      if (!doneFileNames.includes(fileName)) {
        loc = this._findDefinition(fileName, current);
        if (loc) return loc;
        doneFileNames.push(fileName);
      }
    }
  }

  _getMagikFilesInDirectory(dir) {
    const magikFiles = [];
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      if (path.extname(file) === '.magik') {
        magikFiles.push(path.join(dir, file));
      }
    });
    return magikFiles;
  }

  async _getMethodCompletionItems(doc, pos, currentWord, previousWord) {
    const items = [];
    const className = this._getCurrentReceiver(doc, pos, previousWord);
    const inherit = previousWord === '_super';
    const query = className
      ? `^${className}$.^${currentWord}`
      : `^${currentWord}`;

    this.resolveSymbols = false;
    const symbols = await this.symbolProvider.getSymbols(query, inherit);
    this.resolveSymbols = true;

    const methodNames = [];
    const symbolsLength = symbols.length;

    for (let i = 0; i < symbolsLength; i++) {
      const sym = symbols[i];
      const name = sym._methodName;

      if (className || !methodNames.includes(name)) {
        const item = new vscode.CompletionItem(
          name,
          vscode.CompletionItemKind.Method
        );
        item.insertText = sym._completionName;
        if (className) {
          item.detail = sym.name;
        } else {
          item.detail = 'Method';
          methodNames.push(name);
        }
        items.push(item);
      }
    }

    return items;
  }

  async provideCompletionItems(doc, pos) {
    const currentWord = magikUtils.currentWord(doc, pos);
    if (!currentWord) return;

    const currentText = doc.lineAt(pos.line).text;
    const previousWord = magikUtils.previousVarInString(
      currentText,
      pos.character
    );

    if (previousWord) {
      const items = await this._getMethodCompletionItems(
        doc,
        pos,
        currentWord,
        previousWord
      );
      return items;
    }

    const index = currentText.indexOf(
      currentWord,
      pos.character - currentWord.length + 1
    );

    if (magikUtils.previousCharacter(currentText, index) !== '.') {
      const items = [];
      let length;

      if ('class'.startsWith(currentWord)) {
        const item = new vscode.CompletionItem(
          '@class',
          vscode.CompletionItemKind.Keyword
        );
        item.detail = 'Keyword';
        item.insertText = '# @class ';
        item.sortText = '0class';
        item.filterText = 'class';
        items.push(item);
      }

      length = magikUtils.MAGIK_KEYWORDS.length;
      for (let i = 0; i < length; i++) {
        const key = magikUtils.MAGIK_KEYWORDS[i];
        const label = `_${key}`;
        if (key.startsWith(currentWord) || label.startsWith(currentWord)) {
          const item = new vscode.CompletionItem(
            label,
            vscode.CompletionItemKind.Keyword
          );
          item.detail = 'Keyword';
          item.sortText = `1${key}`;
          item.filterText = key;
          items.push(item);
        }
      }

      length = this.symbolProvider.classNames.length;
      for (let i = 0; i < length; i++) {
        const className = this.symbolProvider.classNames[i];
        if (this.symbolProvider.matchString(className, currentWord, 0)) {
          const item = new vscode.CompletionItem(
            className,
            vscode.CompletionItemKind.Class
          );
          item.detail = 'Class';
          item.sortText = `2${className}`;
          item.filterText = className;
          items.push(item);
        }
      }

      const vars = magikVar.getMethodVariables(
        pos,
        this.symbolProvider.classNames,
        this.symbolProvider.classData,
        this.symbolProvider.globals
      );
      length = vars.length;
      for (let i = 0; i < length; i++) {
        const varName = vars[i];
        if (this.symbolProvider.matchString(varName, currentWord, 0)) {
          const item = new vscode.CompletionItem(
            varName,
            vscode.CompletionItemKind.Variable
          );
          item.detail = 'Variable';
          item.sortText = `3${varName}`;
          item.filterText = varName;
          items.push(item);
        }
      }

      length = this.symbolProvider.globals.length;
      for (let i = 0; i < length; i++) {
        const global = this.symbolProvider.globals[i];
        if (this.symbolProvider.matchString(global, currentWord, 0)) {
          const item = new vscode.CompletionItem(
            global,
            vscode.CompletionItemKind.Variable
          );
          item.detail = 'Global';
          item.sortText = `4${global}`;
          item.filterText = global;
          items.push(item);
        }
      }

      return items;
    }
  }

  _getMethodComment(fileLines, startLine) {
    const methodReg = /(^|\s+)_method\s+/;
    const lines = [];
    const lineCount = fileLines.length;
    let firstRow;
    let lastRow;

    for (let row = startLine; row > -1; row--) {
      const lineText = fileLines[row];
      const lineTextTrimmed = lineText.trim();

      if (
        lineTextTrimmed === '$' ||
        lineTextTrimmed.startsWith('_pragma') ||
        lineTextTrimmed.startsWith('_endmethod') ||
        lineTextTrimmed.startsWith('_endproc') ||
        lineTextTrimmed.startsWith('_endblock')
      ) {
        break;
      }

      if (lineTextTrimmed.startsWith('##')) {
        lines.unshift(lineText.split('##')[1].trim());
      }

      firstRow = row;
    }

    for (let row = startLine; row < lineCount; row++) {
      const lineText = fileLines[row];
      const lineTextTrimmed = lineText.trim();

      if (
        lineTextTrimmed === '$' ||
        lineTextTrimmed.startsWith('_endmethod') ||
        lineTextTrimmed.startsWith('_pragma') ||
        (row !== startLine && methodReg.test(lineTextTrimmed))
      ) {
        break;
      }

      if (lineTextTrimmed.startsWith('##')) {
        lines.push(lineText.split('##')[1].trim());
      }

      lastRow = row;
    }

    return {
      comment: lines.join('\n'),
      firstRow,
      lastRow,
    };
  }

  _getMethodHelp(sym, paramIndex) {
    let help = sym._help;

    if (!help) {
      const fileLines = fs
        .readFileSync(sym.location.uri.fsPath)
        .toString()
        .split('\n'); // TODO replace this

      const startLine = sym.location.range.start.line;
      const commentData = this._getMethodComment(fileLines, startLine);
      const lines = [];

      for (let row = startLine; row < commentData.lastRow + 1; row++) {
        lines.push(fileLines[row]);
      }

      const params = [];
      const varNames = [];
      const vars = magikUtils.getMethodParams(lines, 0);
      for (const [varName, data] of Object.entries(vars)) {
        if (data.param) {
          params.push(new vscode.ParameterInformation(varName));
          varNames.push(varName);
        }
      }

      const symName = sym.name;
      let name = symName;
      if (symName.endsWith(')')) {
        name = `${symName.substring(0, symName.length - 1)}${varNames.join(
          ', '
        )})`;
      } else if (symName.endsWith('<')) {
        name = `${symName.substring(0, symName.length - 2)} << ${varNames[0]}`;
      }

      const info = new vscode.SignatureInformation(name, commentData.comment);

      info.parameters = params;

      help = new vscode.SignatureHelp();
      help.signatures = [info];
      help.activeSignature = 0;

      sym._help = help;
    }

    help.activeParameter = paramIndex;

    return help;
  }

  async provideSignatureHelp(doc, pos) {
    let lineText = doc.lineAt(pos.line).text;
    lineText = lineText.substr(0, pos.character);

    const match = /[a-zA-Z0-9_?!]+\.[a-zA-Z0-9_?!]+\s*(\(|<<)\s*([a-zA-Z0-9_?!]+\s*,*\s*)*$/.exec(
      lineText
    );
    if (match) {
      const text = match[0];
      const newCol = match.index + text.indexOf('.') + 1;
      const newPos = new vscode.Position(pos.line, newCol);

      const def = await this._getCurrentDefinitionSymbol(doc, newPos);

      if (def.symbol) {
        const paramIndex = (text.match(/,/g) || []).length;
        return this._getMethodHelp(def.symbol, paramIndex);
      }
    }
  }

  _parentClasses(className, parents) {
    const data = this.symbolProvider.classData[className];
    if (data) {
      for (const parentClassName of data.parents) {
        parents.push(parentClassName);
        this._parentClasses(parentClassName, parents);
      }
    }
  }

  async _runTest() {
    const lines = magikUtils.currentRegion(true).lines;
    if (!lines) return;

    await this.symbolProvider.loadSymbols();

    const res = magikUtils.getClassAndMethodName(lines[0]);
    if (res.methodName) {
      const parents = [];
      this._parentClasses(res.className, parents);

      if (res.methodName.startsWith('test_') && parents.includes('test_case')) {
        const command = `vs_run_test("${res.className}", "${res.methodName}")`;

        vscode.commands.executeCommand('workbench.action.terminal.focus', {});

        this._sendToTerminal(command);
      }
    }
  }
}

module.exports = MagikVSCode;
