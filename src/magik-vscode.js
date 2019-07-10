'use strict';

const vscode = require('vscode'); // eslint-disable-line
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const magikUtils = require('./magik-utils');

const DEFAULT_GLOBALS = [
  'newline_char',
  'tab_char',
  'space_char',
  'system_messages',
  '!output!',
  '!error_output!',
  '!terminal!',
  '!window_system!',
  '!print_length!',
  'thread',
];

class MagikVSCode {
  constructor(context) {
    this.classData = {};
    this.classNames = [];
    this.globals = [...DEFAULT_GLOBALS];
    this.openFiles = [];
    this.currentSymbols = [];
    this.resolveSymbols = true;

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
      ['compileSelection', this._compileSelection],
      ['refreshSymbols', this._refreshSymbols],
      ['gotoPreviousDefinition', this._gotoPreviousDefinition],
      ['gotoNextDefinition', this._gotoNextDefinition],
      ['runTest', this._runTest],
      ['compileExtensionMagik', this._compileExtensionMagik],
      ['newBuffer', this._newMagikBuffer],
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

  _compileText(lines) {
    const tempFile = path.join(os.tmpdir(), 'vscode_temp.magik');
    const command = 'vs_load()\u000D';
    const output = lines.join('\r\n');

    fs.writeFileSync(tempFile, output);

    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
      text: command,
    });
  }

  _compileFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const {fileName} = doc;

    if (doc.isDirty) {
      const lines = [`# Output:Loading file '${fileName}' ...`];
      const linesLength = doc.lineCount;
      for (let i = 0; i < linesLength; i++) {
        lines.push(doc.lineAt(i).text);
      }
      this._compileText(lines);
    } else if (fileName.split('.').slice(-1)[0] === 'magik') {
      const command = `load_file("${fileName}")\u000D`;
      vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
        text: command,
      });
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
        '# Output:Loading selection ...',
      ];
      lines.push(text);
      this._compileText(lines);
    }
  }

  _compileMethod() {
    const lines = magikUtils.currentRegion(true).lines;
    if (!lines) return;

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

    lines.unshift(`# Output:Loading ${className}.${methodName} ...`);
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

  _compileExtensionMagik() {
    const ext = vscode.extensions.getExtension('GE-Smallworld.magik-vscode');
    if (ext) {
      const fileName = path.join(ext.extensionPath, 'vscode_dev.magik');
      const command = `load_file("${fileName}")\u000D`;
      vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
        text: command,
      });
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
      `\\.\\s*(define_slot_access|define_shared_constant|def_property|define_property|define_shared_variable)\\s*\\(\\s*:${word}`
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

  _matchString(string, query, matchType) {
    if (matchType === 0) {
      const length = query.length;
      if (length > string.length) return false;

      let index = 0;
      for (let i = 0; i < length; i++) {
        index = string.indexOf(query[i], index);
        if (index === -1) return false;
        index++;
      }

      return true;
    }
    if (matchType === 1) {
      return string === query;
    }
    if (matchType === 2) {
      return string.startsWith(query);
    }
    if (matchType === 3) {
      return string.endsWith(query);
    }
    return false;
  }

  _getMethodSymbol(name, fileName, methodData) {
    let sym = methodData.symbol;
    if (!sym) {
      const type = methodData.variable
        ? vscode.SymbolKind.Variable
        : vscode.SymbolKind.Method;
      const loc = new vscode.Location(vscode.Uri.file(fileName), undefined);
      const mName = methodData.name;

      sym = new vscode.SymbolInformation(name, type, undefined, loc);
      sym._fileName = fileName;
      sym._methodName = mName;

      const length = mName.length;
      const last = mName[length - 1];
      if (last === ')') {
        sym._completionName = mName.substr(0, length - 1);
      } else if (last === '<') {
        sym._completionName = `${mName.substr(0, length - 2)} << `;
      } else {
        sym._completionName = mName;
      }

      methodData.symbol = sym;
    }
    return sym;
  }

  _findMethods(
    className,
    methodString,
    symbols,
    doneMethods,
    checkParents,
    methodMatchType,
    max
  ) {
    const data = this.classData[className];
    const sourceFile = data.sourceFile;
    const methods = data.methods;
    const methodsLength = methods.length;

    for (let methodIndex = 0; methodIndex < methodsLength; methodIndex++) {
      const methodData = methods[methodIndex];
      const name = `${className}.${methodData.name}`;

      if (
        !doneMethods.includes(name) &&
        this._matchString(methodData.name, methodString, methodMatchType)
      ) {
        let fileName = methodData.sourceFile;
        if (!fileName) {
          fileName = sourceFile;
        }
        const sym = this._getMethodSymbol(name, fileName, methodData);

        symbols.push(sym);
        doneMethods.push(name);

        if (doneMethods.length >= max) return;
      }
    }

    if (checkParents) {
      const parents = data.parents;
      const parentsLength = parents.length;

      for (let parentIndex = 0; parentIndex < parentsLength; parentIndex++) {
        this._findMethods(
          parents[parentIndex],
          methodString,
          symbols,
          doneMethods,
          true,
          methodMatchType,
          max
        );
        if (doneMethods.length >= max) return;
      }
    }
  }

  _findSuperMethods(
    className,
    methodString,
    symbols,
    doneMethods,
    methodMatchType,
    max
  ) {
    const data = this.classData[className];
    const parents = data.parents;
    const parentsLength = parents.length;

    for (let parentIndex = 0; parentIndex < parentsLength; parentIndex++) {
      this._findMethods(
        parents[parentIndex],
        methodString,
        symbols,
        doneMethods,
        false,
        methodMatchType,
        max
      );
      if (doneMethods.length >= max) return;
    }

    if (doneMethods.length === 0) {
      for (let parentIndex = 0; parentIndex < parentsLength; parentIndex++) {
        this._findSuperMethods(
          parents[parentIndex],
          methodString,
          symbols,
          doneMethods,
          methodMatchType,
          max
        );
        if (doneMethods.length >= max) return;
      }
    }
  }

  async provideWorkspaceSymbols(query) {
    return this._getSymbols(query);
  }

  async _getSymbols(query, inherit, max = 500) {
    await this.loadSymbols();

    const queryString = query.replace(' ', '');
    const queryParts = queryString.split('.');
    let classString;
    let methodString;
    let classMatchType = 0;
    let methodMatchType = 0;

    if (queryParts.length > 1) {
      classString = queryParts[0];
      methodString = queryParts[1];
      if (classString.length < 2 && methodString.length < 2) return;
    } else {
      methodString = queryParts[0];
      if (methodString.length < 2) return;
    }

    if (classString) {
      if (
        classString[0] === '^' &&
        classString[classString.length - 1] === '$'
      ) {
        classMatchType = 1;
        classString = classString.substr(1, classString.length - 2);
      } else if (classString[0] === '^') {
        classMatchType = 2;
        classString = classString.substr(1, classString.length - 1);
      } else if (classString[classString.length - 1] === '$') {
        classMatchType = 3;
        classString = classString.substr(0, classString.length - 1);
      }
    }
    if (
      methodString[0] === '^' &&
      methodString[methodString.length - 1] === '$'
    ) {
      methodMatchType = 1;
      methodString = methodString.substr(1, methodString.length - 2);
    } else if (methodString[0] === '^') {
      methodMatchType = 2;
      methodString = methodString.substr(1, methodString.length - 1);
    } else if (methodString[methodString.length - 1] === '$') {
      methodMatchType = 3;
      methodString = methodString.substr(0, methodString.length - 1);
    }

    const symbols = [];
    const doneMethods = [];
    const classLength = this.classNames.length;

    for (let classIndex = 0; classIndex < classLength; classIndex++) {
      const className = this.classNames[classIndex];

      if (
        !classString ||
        this._matchString(className, classString, classMatchType)
      ) {
        if (inherit) {
          this._findSuperMethods(
            className,
            methodString,
            symbols,
            doneMethods,
            methodMatchType,
            max
          );
        } else {
          this._findMethods(
            className,
            methodString,
            symbols,
            doneMethods,
            classString,
            methodMatchType,
            max
          );
        }
      }
    }

    symbols.sort((a, b) => a.name.localeCompare(b.name));

    return symbols;
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
    const region = magikUtils.currentRegion(false, pos.line);
    const lines = region.lines;
    const names = magikUtils.getClassAndMethodName(lines[0]);
    const currentClassName = names ? names.className : undefined;
    let className;

    if (['_self', '_super', '_clone'].includes(previousWord)) {
      className = currentClassName;
    } else if (this.classData[previousWord]) {
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
        const firstRow = region.firstRow;
        const end = pos.line - firstRow + 1;
        const assignedVars = {};

        for (let i = 0; i < end; i++) {
          const row = firstRow + i;
          const lineText = lines[i];

          this.findAssignedVariables(lineText, row, assignedVars);
          this.findLocalVariables(lineText, row, assignedVars, []);
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
    const start = text.indexOf(
      currentWord,
      pos.character - currentWord.length + 1
    );

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
      let symbols = await this._getSymbols(query, inherit, 1);

      if (symbols.length !== 1) {
        query = `^${currentWord}$`;
        symbols = await this._getSymbols(query);
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
    const pos = editor.selection.active;
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

    // TODO - recognise _super()

    const inherit = def.previousWord === '_super';

    const command = `vs_goto("^${def.currentWord}$", "${
      def.className
    }", ${inherit})\u000D`;
    vscode.commands.executeCommand('workbench.action.terminal.focus', {});
    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
      text: command,
    });
  }

  _refreshSymbols() {
    const command = 'vs_save_symbols()\u000D';
    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
      text: command,
    });
  }

  async _wait(ms) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  async loadSymbols() {
    const symbolFile = path.join(os.tmpdir(), 'vscode_symbols.txt');
    if (!fs.existsSync(symbolFile)) return;

    const input = fs.createReadStream(symbolFile);
    const rl = readline.createInterface({input});

    this.classData = {};
    this.globals = [...DEFAULT_GLOBALS];

    rl.on('line', (line) => {
      if (line.startsWith('glob:') || line.startsWith('cond:')) {
        const globalName = line.split(':')[1];
        this.globals.push(globalName);
        return;
      }
      const parts = line.split('|');
      const className = parts[0];
      const classSourceFile = parts[1];
      const parents = parts[2].split(';');
      parents.pop();
      const methodParts = parts[3].split(';');
      const methodLength = methodParts.length - 1;
      const methods = [];

      for (let i = 0; i < methodLength; i++) {
        const data = methodParts[i].split(',');
        const methodData = {
          name: data[0],
          variable: data[1] === '1',
        };
        if (data[2] !== '') {
          methodData.sourceFile = data[2];
        }
        methods.push(methodData);
      }

      this.classData[className] = {
        sourceFile: classSourceFile,
        parents,
        methods,
      };
    });

    let done = false;
    rl.on('close', () => {
      done = true;
    });

    for (let i = 0; i < 50; i++) {
      if (done) {
        this.classNames = Object.keys(this.classData);
        fs.unlinkSync(symbolFile);
        return;
      }
      await this._wait(50); //eslint-disable-line
    }
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

  // TODO - handle assigned across multiple lines
  findAssignedVariables(lineText, row, assignedVars) {
    const text = lineText.split('#')[0];
    const assignSplit = text.split('<<');
    const assignSplitLength = assignSplit.length;
    if (assignSplitLength < 2) return;

    let annoClasses = [];
    let annoSplit = lineText.split('# @class');
    if (annoSplit.length < 2) {
      annoSplit = lineText.split('#@class');
    }
    if (annoSplit.length > 1) {
      annoClasses = annoSplit[1].split(',').map((type) => type.trim());
    }
    const annoLength = annoClasses.length;

    let varCount = 0;
    let match;

    for (let i = 0; i < assignSplitLength - 1; i++) {
      let testString = assignSplit[i].split('(').slice(-1)[0];
      let startIndex = text.indexOf(testString);
      testString = magikUtils.removeStrings(testString);

      if (!/]\s*$/.test(testString)) {
        while (match = magikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
          const varName = match[0];
          const varIndex = match.index;

          if (
            Number.isNaN(Number(varName)) &&
            testString[varIndex] !== '_' &&
            !magikUtils.VAR_IGNORE_PREV_CHARS.includes(
              testString[varIndex - 1]
            ) &&
            !magikUtils.ASSIGN_IGNORE_NEXT.test(
              testString.slice(varIndex + varName.length)
            )
          ) {
            const varData = assignedVars[varName];
            const index = text.indexOf(varName, startIndex);
            startIndex = index + 1;

            if (varData) {
              varData.row = row;
              varData.index = index;
            } else {
              const dynamic = /_dynamic\s+$/.test(text.substr(0, index));
              let className;

              if (varCount < annoLength) {
                className = annoClasses[varCount];
              } else if (
                /^\s*<<\s*[a-zA-Z0-9_?!]+.new\s*\(/.test(
                  text.slice(index + varName.length)
                )
              ) {
                className = magikUtils.nextWordInString(text, index);
              }

              assignedVars[varName] = {
                row,
                index,
                count: 1,
                dynamic,
                className,
              };

              varCount++;
            }
          }
        }
      }
    }
  }

  findLocalVariables(lineText, row, assignedVars, diagnostics) {
    const text = lineText.split('#')[0];
    let testString = magikUtils.removeStrings(text);
    testString = magikUtils.removeSymbolsWithPipes(testString);

    const showUndefined = this.classNames.length > 0; // Need class name and globals
    const defLength = magikUtils.DEFINE_KEYWORD_TESTS.length;

    let annoClasses = [];
    let annoSplit = lineText.split('# @class');
    if (annoSplit.length < 2) {
      annoSplit = lineText.split('#@class');
    }
    if (annoSplit.length > 1) {
      annoClasses = annoSplit[1].split(',').map((type) => type.trim());
    }
    const annoLength = annoClasses.length;

    let varCount = 0;
    let startIndex;
    let match;

    // TODO - loop scopes
    if (testString.includes('_for ') && testString.includes(' _over ')) {
      const overSplit = testString.split(' _over ');
      const iterTestString = overSplit[0].split('_for ').slice(-1)[0];
      startIndex = text.indexOf(iterTestString);

      while (match = magikUtils.VAR_TEST.exec(iterTestString)) { // eslint-disable-line
        const varName = match[0];
        const varIndex = text.indexOf(varName, startIndex);
        startIndex = varIndex + 1;

        assignedVars[varName] = {
          row,
          index: varIndex,
          count: 1,
        };
      }
    }

    startIndex = 0;

    while (match = magikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
      const varName = match[0];
      const varLength = varName.length;
      let varIndex = match.index;
      const defTestString = text.substr(0, varIndex);

      if (
        Number.isNaN(Number(varName)) &&
        testString[varIndex] !== '_' &&
        !magikUtils.VAR_IGNORE_PREV_CHARS.includes(testString[varIndex - 1])
      ) {
        const varData = assignedVars[varName];
        varIndex = text.indexOf(varName, startIndex);

        if (
          showUndefined &&
          !varData &&
          magikUtils.nextChar(testString, varIndex + varLength) !== '('
        ) {
          let def = false;

          for (let defIndex = 0; defIndex < defLength; defIndex++) {
            if (magikUtils.DEFINE_KEYWORD_TESTS[defIndex].test(defTestString)) {
              assignedVars[varName] = {
                row,
                index: varIndex,
                count: 1,
                global: defIndex === 1,
                dynamic: defIndex === 2,
              };
              if (varCount < annoLength) {
                assignedVars[varName].className = annoClasses[varCount];
              }
              def = true;
              break;
            }
          }

          if (
            !def &&
            !this.classData[varName] &&
            !this.globals.includes(varName)
          ) {
            const range = new vscode.Range(
              row,
              varIndex,
              row,
              varIndex + varLength
            );
            const d = new vscode.Diagnostic(
              range,
              `'${varName}' is not defined.`,
              vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(d);
          }
        }

        if (
          varData &&
          (varData.row !== row || varData.index !== varIndex) &&
          !magikUtils.IMPORT_TEST.test(text.substr(0, varIndex))
        ) {
          varData.count++;
        }

        varCount++;
      }

      startIndex = varIndex + varLength;
    }
  }

  getVariables(lines, firstRow, diagnostics) {
    const assignedVars = magikUtils.getMethodParams(lines, firstRow);
    const end = lines.length - 1;
    let search = false;

    for (let i = 0; i < end; i++) {
      const row = firstRow + i;
      const line = lines[i];
      const text = line.split('#')[0];

      if (search) {
        this.findAssignedVariables(line, row, assignedVars);
        this.findLocalVariables(line, row, assignedVars, diagnostics);
      } else if (
        /(\)|<<|\])/.test(text) ||
        /(^|\s+)_method\s+.*[a-zA-Z0-9_?!]$/.test(text)
      ) {
        search = true;
      }
    }

    return assignedVars;
  }

  _getMethodVariables(pos) {
    const region = magikUtils.currentRegion(false, pos.line);
    const {lines} = region;
    let vars = {};

    if (lines) {
      const {firstRow} = region;
      vars = this.getVariables(lines, firstRow, []);
    }

    return Object.keys(vars);
  }

  async _getMethodCompletionItems(doc, pos, currentWord, previousWord) {
    const items = [];
    const className = this._getCurrentReceiver(doc, pos, previousWord);
    const inherit = previousWord === '_super';
    const query = className
      ? `^${className}$.^${currentWord}`
      : `^${currentWord}`;

    this.resolveSymbols = false;
    const symbols = await this._getSymbols(query, inherit);
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

      length = this.classNames.length;
      for (let i = 0; i < length; i++) {
        const className = this.classNames[i];
        if (this._matchString(className, currentWord, 0)) {
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

      const vars = this._getMethodVariables(pos);
      length = vars.length;
      for (let i = 0; i < length; i++) {
        const varName = vars[i];
        if (this._matchString(varName, currentWord, 0)) {
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

      length = this.globals.length;
      for (let i = 0; i < length; i++) {
        const global = this.globals[i];
        if (this._matchString(global, currentWord, 0)) {
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
    const data = this.classData[className];
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

    await this.loadSymbols();

    const res = magikUtils.getClassAndMethodName(lines[0]);
    if (res.methodName) {
      const parents = [];
      this._parentClasses(res.className, parents);

      if (res.methodName.startsWith('test_') && parents.includes('test_case')) {
        const command = `vs_run_test("${res.className}", "${
          res.methodName
        }")\u000D`;
        vscode.commands.executeCommand('workbench.action.terminal.focus', {});
        vscode.commands.executeCommand(
          'workbench.action.terminal.sendSequence',
          {
            text: command,
          }
        );
      }
    }
  }
}

module.exports = MagikVSCode;
