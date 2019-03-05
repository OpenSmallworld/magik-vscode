'use strict';

const vscode = require('vscode'); // eslint-disable-line
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const magikUtils = require('./magik-utils');

class MagikVSCode {
  constructor(context) {
    this.classData = {};
    this.classNames = [];
    this.openFiles = [];

    this._initialise(context);
  }

  // get classData() {
  //   return this.classData;
  // }

  // get classNames() {
  //   return this.classNames;
  // }

  // get openFiles() {
  //   return this.openFiles;
  // }

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

    this._registerFiles(context);
  }

  _compileText(lines) {
    const tempFile = 'C:/Temp/vscode_temp.magik';
    const command = 'vs_load()\u000D';
    const output = lines.join('\r\n');

    fs.writeFileSync(tempFile, output);

    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
      text: command,
    });
  }

  _compileFile() {
    const editor = vscode.window.activeTextEditor;
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
    const doc = editor.document;
    const selection = editor.selection;

    if (!selection.empty) {
      const text = doc.getText(
        new vscode.Range(selection.start, selection.end)
      );
      const lines = [
        '#% text_encoding = iso8859_1',
        '_package sw',
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

    const parts = lines[0].split('.');
    const className = parts[0]
      .split(' ')
      .splice(-1)[0]
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
    lines.unshift('_package sw');
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

  // TODO - assumes definitions are on one line!
  _findDefinition(fileName, word) {
    const lines = fs
      .readFileSync(fileName)
      .toString()
      .split('\n'); // TODO replace this
    const lineCount = lines.length;

    const methodTest = new RegExp(`(^_method | _method ).+\\.\\s*(${word})`);
    const defineTest = new RegExp(
      `\\.\\s*(define_slot_access|define_shared_constant|def_property|define_property|define_shared_variable)\\s*\\(\\s*:(${word})`
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
      sym = new vscode.SymbolInformation(name, type, undefined, loc);
      sym._fileName = fileName;
      sym._methodName = methodData.name;
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
    methodMatchType
  ) {
    const data = this.classData[className];
    const sourceFile = data.sourceFile;
    const methods = data.methods;
    const methodsLength = methods.length;
    const max = 500;

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

        if (doneMethods.length === max) return;
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
          methodMatchType
        );
        if (doneMethods.length === max) return;
      }
    }
  }

  _findSuperMethods(
    className,
    methodString,
    symbols,
    doneMethods,
    methodMatchType
  ) {
    const data = this.classData[className];
    const parents = data.parents;
    const parentsLength = parents.length;
    const max = 500;

    for (let parentIndex = 0; parentIndex < parentsLength; parentIndex++) {
      this._findMethods(
        parents[parentIndex],
        methodString,
        symbols,
        doneMethods,
        false,
        methodMatchType
      );
      if (doneMethods.length === max) return;
    }

    if (doneMethods.length === 0) {
      for (let parentIndex = 0; parentIndex < parentsLength; parentIndex++) {
        this._findSuperMethods(
          parents[parentIndex],
          methodString,
          symbols,
          doneMethods,
          methodMatchType
        );
        if (doneMethods.length === max) return;
      }
    }
  }

  async provideWorkspaceSymbols(query, inherit) {
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
            methodMatchType
          );
        } else {
          this._findMethods(
            className,
            methodString,
            symbols,
            doneMethods,
            classString,
            methodMatchType
          );
        }
      }
    }

    symbols.sort((a, b) => a.name.localeCompare(b.name));

    return symbols;
  }

  _resolveSymbol(sym) {
    const index = sym._methodName.search(magikUtils.INVALID_CHAR);
    if (index !== -1) {
      sym._methodName = sym._methodName.slice(0, index);
    }
    const loc = this._findDefinition(sym._fileName, sym._methodName);
    if (loc) {
      sym.location = loc;
      return sym;
    }
  }

  async _getCurrentDefinitionSymbol(doc, pos) {
    const col = pos.character;
    const text = doc.lineAt(pos.line).text;
    let revText;
    let start;
    let end;

    revText = text.slice(0, col);
    revText = revText
      .split('')
      .reverse()
      .join('');
    start = revText.search(magikUtils.INVALID_CHAR);
    if (start === -1) return {};

    start = col - start;

    end = text.slice(col).search(magikUtils.INVALID_CHAR);
    if (end === -1) {
      end = text.length;
    } else {
      end = col + end;
    }

    if (start === end) return {};

    let currentText = text.slice(start, end).trim();

    const next = text.slice(end).search(/\S/);
    if (next !== -1) {
      const nextChar = text[end + next];
      if (nextChar === '(') {
        currentText += '()';
      } else if (nextChar === '<' && text[end + next + 1] === '<') {
        currentText += '<<';
      }
    }

    const previousText = magikUtils.previousWord(doc, pos, true);
    let classText = previousText;
    let symbol;
    let inherit = false;

    if (previousText) {
      if (['_self', '_super', '_clone'].includes(previousText)) {
        const className = magikUtils.currentClassName(doc, pos);
        if (className) {
          classText = className;
          if (previousText === '_super') {
            inherit = true;
          }
        }
      }

      let query = `^${classText}$.^${currentText}$`;
      let symbols = await this.provideWorkspaceSymbols(query, inherit);

      if (symbols.length !== 1) {
        query = `^${currentText}$`;
        symbols = await this.provideWorkspaceSymbols(query);
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
      classText,
      currentText,
      previousText,
    };
  }

  async _goto() {
    let editor = vscode.window.activeTextEditor;
    const doc = editor.document;
    const pos = editor.selection.active;

    const {
      symbol,
      classText,
      currentText,
      previousText,
    } = await this._getCurrentDefinitionSymbol(doc, pos);

    if (symbol) {
      const range = symbol.location.range;
      await vscode.commands.executeCommand('vscode.open', symbol.location.uri);
      editor = vscode.window.activeTextEditor;
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      return;
    }

    const inherit = previousText === '_super' ? '_true' : '_false';

    const command = `vs_goto("^${currentText}$", "${classText}", ${inherit})\u000D`;
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
    const symbolFile = 'C:/Temp/vscode_symbols.txt';
    if (!fs.existsSync(symbolFile)) return;

    const input = fs.createReadStream(symbolFile);
    const rl = readline.createInterface({input});

    this.classData = {};

    rl.on('line', (line) => {
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
    const {symbol, previousText} = await this._getCurrentDefinitionSymbol(
      doc,
      pos
    );

    if (symbol) {
      return symbol.location;
    }

    if (!['_self', '_super', '_clone'].includes(previousText)) return;

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

  provideCompletionItems(doc, pos) {
    const current = magikUtils.currentWord(doc, pos);
    if (!current) return;

    const items = [];
    const length = magikUtils.MAGIK_KEYWORDS.length;

    for (let i = 0; i < length; i++) {
      const key = magikUtils.MAGIK_KEYWORDS[i];
      if (key.startsWith(current)) {
        const item = new vscode.CompletionItem(
          `_${key}`,
          vscode.CompletionItemKind.Keyword
        );
        item.detail = 'Magik Keyword';
        items.push(item);
      }
    }

    return items;
  }
}

module.exports = MagikVSCode;
