'use strict';

const vscode = require('vscode'); // eslint-disable-line
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const magikUtils = require('./magik-utils');
const magikVar = require('./magik-variables');

class MagikVSCode {
  constructor(symbolProvider, context) {
    this.fileCache = [];
    this.currentSymbols = [];
    this.resolveSymbols = true;

    this.symbolProvider = symbolProvider;

    this._initialise(context);
  }

  _initialiseCommands(context) {
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
      ['runTestClass', this._runTestClass],
      ['compileMessages', this._compileMessages],
      ['compileExtensionMagik', this._compileExtensionMagik],
      ['newBuffer', this._newMagikBuffer],
      ['showSymbols', this._showSymbols],
      ['gotoClipboardText', this._gotoClipboardText],
      ['smallworldNinja', this._startSmallworldNinja],
    ];

    for (const [name, func] of commandConfig) {
      const disposable = vscode.commands.registerCommand(
        `magik.${name}`,
        (args) => func.call(this, args)
      );
      context.subscriptions.push(disposable);
    }
  }

  _initialise(context) {
    const magikFile = {
      scheme: 'file',
      language: 'magik',
    };

    this._initialiseCommands(context);

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

    context.subscriptions.push(
      vscode.languages.registerRenameProvider(magikFile, this)
    );

    context.subscriptions.push(
      vscode.languages.registerHoverProvider(magikFile, this)
    );

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        try {
          this._updateFileCache(doc);
        } catch (error) {
          console.error(error);
        }
      })
    );
  }

  async _sendToTerminal(textToSend) {
    const processName = vscode.workspace.getConfiguration('magik-vscode')
      .magikProcessName;

    if (processName !== '') {
      const ext = vscode.extensions.getExtension('GE-Smallworld.magik-vscode');
      const scriptName = isNaN(processName)
        ? 'sendToMagikName.vbs'
        : 'sendToMagikID.vbs';
      const file = path.join(ext.extensionPath, 'scripts', scriptName);
      let text = textToSend;
      for (const c of ['~', '!', '^', '+', '(', ')']) {
        text = text.replace(new RegExp(`\\${c}`, 'g'), `{${c}}`);
      }
      text = text.replace(/"/g, "'");
      const command = `cscript ${file} "${processName}" "${text}"`;
      await cp.execSync(command);
    } else {
      const command = `${textToSend}\u000D`;

      if (
        vscode.workspace.getConfiguration('magik-vscode')
          .enableAutoScrollToPrompt
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
  }

  async _compileText(lines) {
    const tempFile = path.join(os.tmpdir(), 'vscode_temp.magik');
    const output = lines.join('\r\n');

    fs.writeFileSync(tempFile, output);

    await this._sendToTerminal('vs_load()');
  }

  async _compileFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const {fileName} = doc;
    const classNames = magikUtils.allClassNames(doc);
    let classNamesStr;

    if (classNames.length > 0) {
      await this.symbolProvider.loadSymbols();

      for (const className of classNames) {
        if (classNamesStr) {
          classNamesStr += `, :${className}`;
        } else {
          classNamesStr = `:${className}`;
        }
      }
    }

    if (doc.isDirty) {
      const lines = this.getDocLines(doc);

      lines.unshift(`# Output:Loading file '${fileName}'...`);

      if (classNames.length > 0) {
        lines.push('_block');

        lines.push(`vs_save_symbols({${classNamesStr}})`);
        lines.push('_endblock');
        lines.push('$');
      }

      await this._compileText(lines);
    } else if (path.extname(fileName) === '.magik') {
      let command;

      if (classNames.length > 0) {
        command = `load_file("${fileName}"); vs_save_symbols({${classNamesStr}})`;
      } else {
        command = `load_file("${fileName}")`;
      }

      await this._sendToTerminal(command);
    }
  }

  async _loadModule() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const {fileName} = doc;

    if (path.extname(fileName) === '.magik') {
      await this.symbolProvider.loadSymbols();

      const name = path.basename(fileName, '.magik');
      const searchPath = path.dirname(fileName);
      const command = `load_file_name("${name}", "${searchPath}", _true); vs_save_symbols()`;

      await this._sendToTerminal(command);
    }
  }

  async _compileSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const text = this._selectedText();
    if (!text) return;

    const doc = editor.document;
    const selection = editor.selection;
    const packageName = magikUtils.getPackageName(doc);
    const className = magikUtils.currentClassName(
      doc,
      selection.end.line,
      selection.start.line
    );

    const lines = [
      '#% text_encoding = iso8859_1',
      `_package ${packageName}`,
      '$',
      '# Output:Loading selection...',
    ];
    lines.push(text);

    if (className) {
      await this.symbolProvider.loadSymbols();

      lines.push('_block');
      lines.push(`vs_save_symbols({:${className}})`);
      lines.push('_endblock');
      lines.push('$');
    }

    await this._compileText(lines);
  }

  async _compileMethod() {
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

    // Set source file and save class symbols
    if (methodName) {
      await this.symbolProvider.loadSymbols();

      lines.push('_block');
      lines.push(`_local meth << ${className}.method(:|${methodName}|)`);
      lines.push(
        `_if meth _isnt _unset _then meth.compiler_info[:source_file] << "${
          doc.fileName
        }" _endif`
      );
      lines.push(`vs_save_symbols({:${className}})`);
      lines.push('_endblock');
      lines.push('$');
    }

    await this._compileText(lines);
  }

  async _compileRegion() {
    const region = magikUtils.currentRegion(false);
    const lines = region.lines;
    if (!lines) return;

    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;
    const fileName = path.basename(doc.fileName);
    const packageName = magikUtils.getPackageName(doc);
    const className = magikUtils.currentClassName(
      doc,
      region.lastRow,
      region.firstRow
    );

    lines.unshift(
      `# Output:Loading ${fileName}:${region.firstRow + 1}-${region.lastRow +
        1}...`
    );
    lines.unshift('$');
    lines.unshift(`_package ${packageName}`);
    lines.unshift('#% text_encoding = iso8859_1');
    lines.push('$');

    if (className) {
      await this.symbolProvider.loadSymbols();

      lines.push('_block');
      lines.push(`vs_save_symbols({:${className}})`);
      lines.push('_endblock');
      lines.push('$');
    }

    await this._compileText(lines);
  }

  async _compileExtensionMagik() {
    const ext = vscode.extensions.getExtension('GE-Smallworld.magik-vscode');
    if (ext) {
      const fileName = path.join(ext.extensionPath, 'vscode_dev.magik');
      const command = `load_file("${fileName}")`;

      await this._sendToTerminal(command);
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
        vscode.window.showTextDocument(resSymbol.location.uri, {
          selection: range,
        });
        return;
      }
    }

    if (this._usingIntegratedTerminal()) {
      vscode.commands.executeCommand('workbench.action.terminal.focus', {});
    }
    await this._sendToTerminal(command);
  }

  _findDefinition(fileName, word, kind) {
    const lines = this.getFileLines(fileName);
    if (!lines) return;

    const lineCount = lines.length;
    let methodTest;
    let defineTest;
    let defineTestMultiLine;

    const invalidIndex = word.search(magikUtils.INVALID_CHAR);

    if (invalidIndex !== -1) {
      // Search for method def only
      word = word.substring(0, invalidIndex);
      const searchName = word.replace(/\?/g, '\\?');
      methodTest = new RegExp(
        `(^|\\s+)_method\\s+.+\\.\\s*${searchName}\\s*(\\(|<<|\\[|^<<)`
      );
    } else {
      const searchName = word.replace(/\?/g, '\\?');
      if (kind !== vscode.SymbolKind.Variable) {
        if (kind) {
          // Search for exact name if resolving a symbol
          methodTest = new RegExp(
            `(^|\\s+)_method\\s+.+\\.\\s*${searchName}\\s*$`
          );
        } else {
          methodTest = new RegExp(
            `(^|\\s+)_method\\s+.+\\.\\s*${searchName}\\s*($|\\(|<<|\\[|^<<)`
          );
        }
      }
      defineTest = new RegExp(
        `\\.\\s*(define_slot_access|define_shared_constant|def_property|define_property|define_shared_variable|define_slot_externally_readable|define_slot_externally_writable)\\s*\\(\\s*:${searchName}($|[^\\w!?])`
      );
      defineTestMultiLine = new RegExp(
        `\\.\\s*(define_slot_access|define_shared_constant|def_property|define_property|define_shared_variable|define_slot_externally_readable|define_slot_externally_writable)\\s*\\(\\s*$`
      );
    }

    for (let row = 0; row < lineCount; row++) {
      let text = magikUtils.stringBeforeComment(lines[row]);
      let index = methodTest ? text.search(methodTest) : -1;

      if (defineTest && index === -1) {
        index = text.search(defineTest);

        if (index === -1 && text.search(defineTestMultiLine) !== -1) {
          const nextResult = magikUtils.nextWordInFile(lines, row + 1, 0, true);
          if (nextResult.word === word) {
            row = nextResult.row;
            text = magikUtils.stringBeforeComment(lines[row]);
            index = 0;
          }
        }
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
    let symbolName;

    if (defTest.type === vscode.SymbolKind.Method) {
      const res = magikUtils.getClassAndMethodName(text);
      if (res.methodName) {
        className = res.className;
        methodName = res.methodName;
        symbolName = res.displayMethodName;
      }
    } else {
      const pos = new vscode.Position(row, index + 1);
      const nextResult = magikUtils.nextWord(doc, pos, true);
      if (nextResult.word) {
        className = magikUtils.currentClassName(doc, pos.line);
        methodName = nextResult.word;
        row = nextResult.row;
        text = doc.lineAt(row).text;
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
        symbolName || methodName,
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
            editor.revealRange(
              range,
              vscode.TextEditorRevealType.InCenterIfOutsideViewport
            );
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
            editor.revealRange(
              range,
              vscode.TextEditorRevealType.InCenterIfOutsideViewport
            );
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
    if (this.resolveSymbols) {
      const loc = this._findDefinition(
        sym._fileName,
        sym._methodName,
        sym.kind
      );
      if (loc) {
        sym.location = loc;
        return sym;
      }
    } else {
      return sym;
    }
  }

  _getCurrentReceiver(doc, pos, previousWord) {
    if (['_self', '_super', '_clone'].includes(previousWord)) {
      return magikUtils.currentClassName(doc, pos.line);
    }

    const currentText = doc.lineAt(pos.line).text;
    const testString = currentText.substring(0, pos.character);

    if (
      this.symbolProvider.classData[previousWord] &&
      !/\.[\w!?]*$/.test(testString) // Not slot or method call
    ) {
      return previousWord;
    }

    const match = /_super\s*\(\s*([\w!?]+)\s*\)\s*\.\s*[\w!?]*$/.exec(
      testString
    );
    if (match) {
      return match[1];
    }

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
      return varData.className;
    }
  }

  async _getCurrentDefinitionSymbol(doc, pos) {
    let currentWord = magikUtils.currentWord(doc, pos);
    if (!currentWord) return {};

    const text = doc.lineAt(pos.line).text;
    const start = text.indexOf(currentWord, pos.character - currentWord.length);

    currentWord = magikUtils.getMethodName(text, currentWord, start);

    const previousWord = magikUtils.previousWord(doc, pos);
    let classString = previousWord;
    let symbol;
    let className;

    if (previousWord) {
      const inherit = previousWord === '_super';
      const receiverClassName = this._getCurrentReceiver(
        doc,
        pos,
        previousWord
      );
      if (receiverClassName) {
        classString = receiverClassName;
        className = receiverClassName;
      }

      let query = `^${classString}$.^${currentWord}$`;
      let symbols = await this.symbolProvider.getSymbols(query, inherit, 1);

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

  async _goto(args) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;

    let pos;
    if (args) {
      pos = args.position;
    }
    if (!pos) {
      pos = editor.selection.active;
    }

    const selectedText = this._selectedText();
    if (
      selectedText &&
      this._posInSelection(pos) &&
      /\s\.{2,}\s/.test(selectedText)
    ) {
      return this._gotoText(selectedText);
    }

    const def = await this._getCurrentDefinitionSymbol(doc, pos);

    if (!def.currentWord) return;

    if (def.symbol) {
      const range = def.symbol.location.range;
      vscode.window.showTextDocument(def.symbol.location.uri, {
        selection: range,
      });
      return;
    }

    const text = doc.lineAt(pos.line).text;
    const start = text.indexOf(
      def.currentWord,
      pos.character - def.currentWord.length
    );

    // Test for _super(classname)
    const superMatch = text
      .substring(0, start)
      .match(/_super\s*\(\s*([\w!?]+)\s*\)\s*\.\s*$/);
    let command;

    if (superMatch) {
      command = `vs_goto("^${def.currentWord}$", "${superMatch[1]}")`;
    } else if (def.className) {
      const inherit = def.previousWord === '_super' ? '_true' : '_false';
      command = `vs_goto("^${def.currentWord}$", "${
        def.className
      }", ${inherit})`;
    } else {
      command = `vs_goto("^${def.currentWord}$")`;
    }

    if (this._usingIntegratedTerminal()) {
      vscode.commands.executeCommand('workbench.action.terminal.focus', {});
    }

    await this._sendToTerminal(command);
  }

  _showSymbols(args) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    let pos;
    if (args) {
      pos = args.position;
    }
    if (!pos) {
      pos = editor.selection.active;
    }

    const selectedText = this._selectedText();

    if (!selectedText || !this._posInSelection(pos)) {
      const doc = editor.document;
      const currentWord = magikUtils.currentWord(doc, pos);

      if (currentWord) {
        const row = pos.line;
        const text = doc.lineAt(row).text;
        const start = text.indexOf(
          currentWord,
          pos.character - currentWord.length
        );
        const range = new vscode.Range(
          row,
          start,
          row,
          start + currentWord.length
        );

        editor.selection = new vscode.Selection(range.start, range.end);
      }
    }

    vscode.commands.executeCommand('workbench.action.showAllSymbols', {});
  }

  async _refreshSymbols() {
    await this._sendToTerminal('vs_save_symbols()');
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
    for (const fileName of this._currentMagikFiles()) {
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

  resolveSymbolCompletion(sym) {
    try {
      if (!sym._completionDocumentation) {
        this.resolveWorkspaceSymbol(sym);
        if (sym.location.range) {
          this._getMethodHelp(sym, 0);
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  async _getMethodCompletionItems(doc, pos, currentWord, previousWord) {
    const items = [];
    const className = this._getCurrentReceiver(doc, pos, previousWord);
    const inherit = previousWord === '_super';
    const query = className
      ? `^${className}$.^${currentWord}`
      : `^${currentWord}`;

    this.resolveSymbols = false;
    let symbols = await this.symbolProvider.getSymbols(query, inherit);
    this.resolveSymbols = true;

    if (className) {
      const symbolsLength = symbols.length;
      const methodNames = {};

      for (let i = 0; i < symbolsLength; i++) {
        const sym = symbols[i];
        const name = sym._methodName;
        const syms = methodNames[name];
        if (syms) {
          syms.push(sym);
        } else {
          methodNames[name] = [sym];
        }
      }

      symbols = [];

      for (const [name, syms] of Object.entries(methodNames)) {
        if (syms.length > 1) {
          // Enhance query to find first method match - don't show extra super methods
          const methodQuery = `^${className}$.^${name}$`;

          this.resolveSymbols = false;
          // eslint-disable-next-line
          const result = await this.symbolProvider.getSymbols(methodQuery, inherit, 1);
          this.resolveSymbols = true;

          if (result.length === 1) {
            symbols.push(result[0]);
          } else {
            Array.prototype.push.apply(symbols, syms);
          }
        } else {
          symbols.push(syms[0]);
        }
      }
    }

    const symbolsLength = symbols.length;
    let docCount = 0;

    for (let i = 0; i < symbolsLength; i++) {
      const sym = symbols[i];
      const name = sym._methodName;
      const item = new vscode.CompletionItem(
        name,
        vscode.CompletionItemKind.Method
      );

      item.detail = sym.name;

      if (docCount < 30) {
        this.resolveSymbolCompletion(sym);
        const documentation = sym._completionDocumentation;
        if (documentation) {
          item.detail = sym._completionName;
          item.documentation = documentation;
          docCount++;
        }
      }

      item.insertText = sym._completionText;

      items.push(item);
    }

    return items;
  }

  async _getCompletionItems(doc, pos) {
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

  async provideCompletionItems(doc, pos) {
    try {
      return this._getCompletionItems(doc, pos);
    } catch (error) {
      console.error(error);
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

    while (lines.length > 1 && lines[0] === '') {
      lines.shift();
    }

    return {
      comment: lines.join('\n'),
      firstRow,
      lastRow,
    };
  }

  _getMethodHelp(sym, paramIndex) {
    let help = sym._help;

    if (help) {
      help.activeParameter = paramIndex;
      return help;
    }

    const fileLines = this.getFileLines(sym.location.uri.fsPath);
    if (!fileLines) return;

    const startLine = sym.location.range.start.line;
    const commentData = this._getMethodComment(fileLines, startLine);
    const lines = [];

    if (commentData.lastRow) {
      for (let row = startLine; row < commentData.lastRow + 1; row++) {
        lines.push(fileLines[row]);
      }
    } else {
      const end = fileLines.length;
      for (let row = startLine; row < end; row++) {
        const line = fileLines[row];
        if (row !== startLine && /^\s*(_|$)/.test(line)) {
          break;
        }
        lines.push(line);
      }
    }

    const methodParams = magikUtils.getMethodParams(lines, 0, false);
    const params = [];
    const paramNames = [];
    let paramString = '';
    let addOptional = true;

    for (const [varName, data] of Object.entries(methodParams)) {
      if (data.param) {
        params.push(new vscode.ParameterInformation(varName));
        paramNames.push(varName);

        if (paramString !== '') {
          paramString += ', ';
        }
        if (data.optional && addOptional) {
          paramString += `_optional ${varName}`;
          addOptional = false;
        } else if (data.gather) {
          paramString += `_gather ${varName}`;
        } else {
          paramString += varName;
        }
      }
    }

    const symName = sym.name;
    let name = symName;

    if (symName.endsWith(')')) {
      name = `${symName.substring(0, symName.length - 1)}${paramString})`;

      if (paramNames.length === 0) {
        sym._completionText = sym._methodName;
      }
    } else if (symName.endsWith('<')) {
      name = `${symName.substring(0, symName.length - 2)} << ${paramNames[0]}`;
    }

    const info = new vscode.SignatureInformation(name, commentData.comment);

    info.parameters = params;
    info._paramString = paramString;

    help = new vscode.SignatureHelp();
    help.signatures = [info];
    help.activeSignature = 0;
    help.activeParameter = paramIndex;

    sym._completionName = name;
    sym._completionDocumentation = commentData.comment;
    sym._help = help;

    return help;
  }

  async provideSignatureHelp(doc, pos) {
    try {
      let lineText = doc.lineAt(pos.line).text;
      lineText = lineText.substring(0, pos.character);

      const match = /[\w!?]+\.[\w!?]+\s*(\(|<<|^<<)\s*([\w!?]+\s*,?\s*)*$/.exec(
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
    } catch (error) {
      console.error(error);
    }
  }

  prepareRename(doc, pos) {
    const err = new Error('Cannot rename current word');

    const currentWord = magikUtils.currentWord(doc, pos);
    if (!currentWord) throw err;

    const currentText = doc.lineAt(pos.line).text;
    const currentIndex = currentText.indexOf(
      currentWord,
      pos.character - currentWord.length + 1
    );

    if (magikUtils.withinString(currentText, currentIndex)) throw err;

    const ignorePrev = ['.', ':', '%'];
    const previousChar = magikUtils.previousCharacter(
      currentText,
      currentIndex
    );
    if (ignorePrev.includes(previousChar)) throw err;

    const region = magikUtils.currentRegion(true);
    if (!region.lines) throw err;
  }

  provideRenameEdits(doc, pos, newName) {
    const currentUri = doc.uri;
    const currentWord = magikUtils.currentWord(doc, pos);
    const region = magikUtils.currentRegion(true);
    const lines = region.lines;
    const firstRow = region.firstRow;
    const end = lines.length;

    const word = currentWord.replace(/\?/g, '\\?');
    const wordLength = currentWord.length;
    const wordTest = new RegExp(
      `(?<=(^|[^.:%\\w!?]))${word}(?=($|[^:%\\w!?]))`,
      'g'
    );

    const edit = new vscode.WorkspaceEdit();

    for (let i = 0; i < end; i++) {
      const row = i + firstRow;
      const lineText = lines[i];
      let match;

      while (match = wordTest.exec(lineText)) { // eslint-disable-line
        const index = match.index;

        if (!magikUtils.withinString(lineText, index)) {
          const range = new vscode.Range(row, index, row, index + wordLength);
          edit.replace(currentUri, range, newName);
        }
      }
    }

    if (edit.size > 0) {
      return edit;
    }
  }

  _selectedText() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const selection = editor.selection;

    if (
      selection.start.character !== selection.end.character ||
      selection.start.line !== selection.end.line
    ) {
      return doc.getText(new vscode.Range(selection.start, selection.end));
    }
  }

  _posInSelection(pos) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    const selection = editor.selection;

    if (selection.start.line === selection.end.line) {
      // Single line
      if (selection.start.character === selection.end.character) return false;

      return (
        pos.line === selection.start.line &&
        pos.character >= selection.start.character &&
        pos.character <= selection.end.character
      );
    }

    // Multi line
    if (pos.line === selection.start.line) {
      return pos.character >= selection.start.character;
    }
    if (pos.line === selection.end.line) {
      return pos.character <= selection.end.character;
    }
    return pos.line >= selection.start.line && pos.line <= selection.end.line;
  }

  _posInComment(pos) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    const doc = editor.document;
    const lineText = doc.lineAt(pos.line).text;
    const text = magikUtils.stringBeforeComment(lineText);

    return pos.character > text.length;
  }

  _getSearchHoverString(doc, currentText) {
    const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const searchStrings = [];

    const defaultArgs = [{query: currentText, triggerSearch: true}];
    const defaultCommand = vscode.Uri.parse(
      `command:workbench.action.findInFiles?${encodeURIComponent(
        JSON.stringify(defaultArgs)
      )}`
    );
    searchStrings.push(`[Search](${defaultCommand} "Search")`);

    const searchFiles = [
      [undefined, 'Folder'],
      ['module.def', 'Module'],
      ['product.def', 'Product'],
      ['.git', 'Repo'],
      ['.vscode', 'Workspace'],
    ];

    let dir = doc.fileName;
    let lastCommand;

    do {
      dir = path.dirname(dir);

      for (const data of searchFiles) {
        const fileName = data[0];
        const commandName = data[1];

        if (!fileName || fs.existsSync(path.join(dir, fileName))) {
          let searchPath = path.relative(rootPath, dir);
          if (searchPath && searchPath !== dir) {
            searchPath = `.${path.sep}${searchPath}`;
          } else {
            searchPath = dir;
          }
          const args = [
            {
              query: currentText,
              filesToInclude: searchPath,
              triggerSearch: true,
            },
          ];
          const command = vscode.Uri.parse(
            `command:workbench.action.findInFiles?${encodeURIComponent(
              JSON.stringify(args)
            )}`
          );

          searchStrings.push(
            `[${commandName}](${command} "Search in ${commandName}")`
          );
          searchFiles.shift();

          lastCommand = commandName;
          break;
        }
      }
    } while (dir !== rootPath && !/[/\\]$/.test(dir));

    if (lastCommand !== 'Workspace') {
      // Add 'search in workspace' if file is outside current workspace
      const args = [
        {
          query: currentText,
          filesToInclude: './',
          triggerSearch: true,
        },
      ];
      const command = vscode.Uri.parse(
        `command:workbench.action.findInFiles?${encodeURIComponent(
          JSON.stringify(args)
        )}`
      );
      searchStrings.push(`[Workspace](${command} "Search in Workspace")`);
    }

    return searchStrings.join(' | ');
  }

  async _getHoverString(doc, pos) {
    let hoverString = '';

    const useSelection = this._posInSelection(pos);
    const lineText = doc.lineAt(pos.line).text;
    const methodDef = /(^|\s)_method\s/.test(lineText);
    const currentText = useSelection
      ? this._selectedText()
      : magikUtils.currentWord(doc, pos);

    if (currentText) {
      const truncatedText =
        currentText.length > 80
          ? `${currentText.substring(0, 78)}..`
          : currentText;
      hoverString += `\`\`\`'${truncatedText}'\`\`\``;

      // Check for unique definition and add comment if available.
      // if (!methodDef) {
      //   const def = await this._getCurrentDefinitionSymbol(doc, pos);
      //   const sym = def.symbol;

      //   if (sym) {
      //     this.resolveSymbolCompletion(sym);
      //     const methodName = sym._completionName;
      //     if (methodName) {
      //       let wrappedMethodName = methodName.replace(
      //         /(.{1,80}})( +|$\n?)|(.{1,80})/g,
      //         '$1$3  \n  '
      //       );
      //       wrappedMethodName = wrappedMethodName.substring(
      //         0,
      //         wrappedMethodName.length - 2
      //       );
      //       const comment = sym._completionDocumentation;
      //       if (comment) {
      //         hoverString += `  \n\`\`\`  \n${wrappedMethodName}  \n${comment}  \n\`\`\``;
      //       } else {
      //         hoverString += `  \n\`\`\`${wrappedMethodName}\`\`\``;
      //       }
      //     }
      //   }
      // }

      const searchString = this._getSearchHoverString(doc, currentText);
      if (searchString) {
        hoverString += `  \n  \n${searchString}`;
      }

      if (!/^(\d|_)/.test(currentText) && !this._posInComment(pos)) {
        const gotoArgs = [{position: pos}];
        let addGoto = true;

        const symbolsCommand = vscode.Uri.parse(
          `command:magik.showSymbols?${encodeURIComponent(
            JSON.stringify(gotoArgs)
          )}`
        );
        hoverString += `  \n  \n[Show Symbols](${symbolsCommand} "Show method symbols for current text")`;

        if (!useSelection) {
          const startTest = new RegExp(`^\\s*${currentText}`);
          const currentIndex = lineText.indexOf(
            currentText,
            pos.character - currentText.length + 1
          );
          addGoto = false;

          if (
            magikUtils.previousCharacter(lineText, currentIndex) === '.' ||
            (startTest.test(lineText) &&
              pos.line !== 0 &&
              /\.\s*$/.test(doc.lineAt(pos.line - 1).text))
          ) {
            addGoto = true;
          }
        }

        if (addGoto) {
          const gotoCommand = vscode.Uri.parse(
            `command:magik.goto?${encodeURIComponent(JSON.stringify(gotoArgs))}`
          );
          hoverString += `  \n  \n[Go To Definition](${gotoCommand} "Go To Definition")`;
        }
      }
    }

    // Check if pointing at test method name
    if (methodDef) {
      const lines = magikUtils.currentRegion(true, pos.line).lines;

      if (lines) {
        await this.symbolProvider.loadSymbols();

        const res = magikUtils.getClassAndMethodName(lines[0]);
        const methodName = res.methodName;

        if (methodName) {
          const parents = [];
          this._parentClasses(res.className, parents);

          if (
            /^(windows_)?test_/.test(methodName) &&
            parents.includes('test_case')
          ) {
            const testArgs = [{position: pos}];
            const testCommand = vscode.Uri.parse(
              `command:magik.runTest?${encodeURIComponent(
                JSON.stringify(testArgs)
              )}`
            );
            const testName = `${res.className}.${res.displayMethodName}`;
            hoverString += `  \n  \n[Run Test](${testCommand} "Run Test: '${testName}'")`;
          }
        }
      }
    }

    return hoverString;
  }

  async provideHover(doc, pos) {
    if (!vscode.workspace.getConfiguration('magik-vscode').enableHoverActions)
      return;

    try {
      const hoverString = await this._getHoverString(doc, pos);

      if (hoverString.length > 0) {
        const range = new vscode.Range(
          pos.line,
          pos.character,
          pos.line,
          pos.character
        );
        const mdString = new vscode.MarkdownString(hoverString, true);
        mdString.isTrusted = true;
        return new vscode.Hover(mdString, range);
      }
    } catch (error) {
      console.error(error);
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

  async _runTest(args) {
    let line;
    if (args && args.position) {
      line = args.position.line;
    }

    const lines = magikUtils.currentRegion(true, line).lines;
    if (!lines) return;

    await this.symbolProvider.loadSymbols();

    const res = magikUtils.getClassAndMethodName(lines[0]);
    if (res.methodName) {
      const parents = [];
      this._parentClasses(res.className, parents);

      if (
        /^(windows_)?test_/.test(res.methodName) &&
        parents.includes('test_case')
      ) {
        const command = `vs_run_test("${res.className}", "${res.methodName}")`;

        if (this._usingIntegratedTerminal()) {
          vscode.commands.executeCommand('workbench.action.terminal.focus', {});
        }

        await this._sendToTerminal(command);
      }
    }
  }

  async _runTestClass() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    await this.symbolProvider.loadSymbols();

    const doc = editor.document;
    const classNames = magikUtils.allClassNames(doc);
    const testClasses = [];

    for (const className of classNames) {
      const parents = [];

      this._parentClasses(className, parents);

      if (parents.includes('test_case')) {
        testClasses.push(className);
      }
    }

    if (testClasses.length === 0) return;

    const command = `run_tests({${testClasses.join(', ')}})`;

    if (this._usingIntegratedTerminal()) {
      vscode.commands.executeCommand('workbench.action.terminal.focus', {});
    }

    await this._sendToTerminal(command);
  }

  async _compileMessages() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const fileName = doc.fileName;
    const command = `vs_compile_messages("${fileName}")`;

    if (this._usingIntegratedTerminal()) {
      vscode.commands.executeCommand('workbench.action.terminal.focus', {});
    }

    await this._sendToTerminal(command);
  }

  async _startSmallworldNinja() {
    const ext = vscode.extensions.getExtension('GE-Smallworld.magik-vscode');
    const command = `start_ninja("${ext.extensionPath}")`;

    if (this._usingIntegratedTerminal()) {
      vscode.commands.executeCommand('workbench.action.terminal.focus', {});
    }

    await this._sendToTerminal(command);
  }

  _currentMagikFiles() {
    const fileNames = [];
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === 'magik') {
        fileNames.push(doc.fileName);
      }
    }
    return fileNames;
  }

  getDocLines(doc) {
    const lines = [];
    const linesLength = doc.lineCount;
    for (let i = 0; i < linesLength; i++) {
      lines.push(doc.lineAt(i).text);
    }
    return lines;
  }

  // Update file cache after saving a file.
  _updateFileCache(doc) {
    const fileName = doc.fileName;
    const cacheLength = this.fileCache.length;

    for (let index = 0; index < cacheLength; index++) {
      const data = this.fileCache[index];

      if (data[0] === fileName) {
        data[1] = this.getDocLines(doc);
        break;
      }
    }
  }

  getFileLines(fileName) {
    if (!fileName || fileName === '') return;

    try {
      if (!fs.existsSync(fileName)) {
        return;
      }
    } catch (err) {
      return;
    }

    let openDoc;

    for (const doc of vscode.workspace.textDocuments) {
      if (doc.fileName === fileName) {
        if (doc.isDirty) {
          // Use lines from unsaved editor
          return this.getDocLines(doc);
        }
        openDoc = doc;
        break;
      }
    }

    const max = 60;
    const cacheLength = this.fileCache.length;

    for (let index = 0; index < cacheLength; index++) {
      const data = this.fileCache[index];

      if (data[0] === fileName) {
        if (index > Math.floor(max * 0.75) - 1) {
          this.fileCache.splice(index, 1);
          this.fileCache.unshift(data);
        }
        return data[1];
      }
    }

    let lines;
    if (openDoc) {
      lines = this.getDocLines(openDoc);
    } else {
      try {
        lines = fs
          .readFileSync(fileName)
          .toString()
          .split('\n');
      } catch (err) {
        vscode.window.showErrorMessage(`Cannot open file: ${fileName}`);
        return;
      }
    }

    this.fileCache.unshift([fileName, lines]);

    if (cacheLength === max) {
      this.fileCache.pop();
    }

    return lines;
  }

  _usingIntegratedTerminal() {
    return (
      vscode.workspace.getConfiguration('magik-vscode').magikProcessName === ''
    );
  }
}

module.exports = MagikVSCode;
