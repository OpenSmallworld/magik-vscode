'use strict';

const vscode = require('vscode'); // eslint-disable-line
const fs = require('fs');
const os = require('os');
const path = require('path');
const chokidar = require('chokidar');
const magikUtils = require('./magik-utils');
const magikVar = require('./magik-variables');
const MagikConsole = require('./magik-console');
const MagikClassBrowser = require('./magik-class-browser');

const TERMINAL_TB_REG = /^([\w!?]+)\.([\w!?\(\)\[\]\^]+)\s+\([\w\d\s\\\/\.:!]+\d+\)/;
const TERMINAL_DEBUG_TB_REG = /^(?:\[\d+\])?\s+([\w!?\(\)\[\]\^]+)\s\.{2,}\s([\w!?]+)\s+/;
const PATH_REG = /(?:\s|[(['"]|^)((\w:)?[^.'"()[\]]+?\.[^.'"()[\]]+?)(:(\d+))?(?:\s|[)\]'"]|$)/;

const SYMBOLS_FILENAME = 'vscode_symbols.txt';
const FILE_CACHE_SIZE = 100;

class MagikVSCode {
  constructor(symbolProvider, context) {
    this.fileCache = [];
    this.currentSymbols = [];
    this.resolveSymbols = true;

    this.symbolProvider = symbolProvider;
    this.magikConsole = new MagikConsole(this);

    this.magikClassBrowser = new MagikClassBrowser(this, context);

    this.symbolFileWatcher = undefined;

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
      ['runMagik', this._runMagik],
      ['runTest', this._runTest],
      ['runTestClass', this._runTestClass],
      ['compileMessages', this._compileMessages],
      ['compileExtensionMagik', this._compileExtensionMagik],
      ['openFile', this._openFile],
      ['newBuffer', this._newMagikBuffer],
      ['newConsole', this._newMagikConsole],
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

        if (this.magikConsole.isConsoleDoc(doc)) {
          this.magikConsole.restartMonitor();
        }
      })
    );

    vscode.window.registerTerminalLinkProvider(this);
  }

  _checkFileAfterSaveSymbols() {
    if (this.symbolFileWatcher === undefined) {
      const fileDir = os.tmpdir();
      const symbolFile = path.join(fileDir, SYMBOLS_FILENAME);
      const watcher = chokidar.watch(symbolFile);
      this.symbolFileWatcher = watcher;

      watcher.on('add', () => {
        watcher.close();
        this.symbolFileWatcher = undefined;
        vscode.commands.executeCommand('magik.checkFile', {});
      });
    }
  }

  _openFile(args) {
    if (args.fileName) {
      const workbenchConfig = vscode.workspace.getConfiguration('workbench');
      const preview = workbenchConfig.editor.enablePreviewFromCodeNavigation;
      const viewColumn = args.firstColumn ? vscode.ViewColumn.One : undefined;
      let selection;

      if (args.lineNumber !== undefined) {
        selection = new vscode.Range(args.lineNumber, 0, args.lineNumber, 0);
      }

      vscode.window.showTextDocument(vscode.Uri.file(args.fileName), {
        preview,
        viewColumn,
        selection,
      });
    }
  }

  _runMagik(args) {
    if (args.text) {
      magikUtils.sendToTerminal(args.text);
    }
  }

  async _compileText(lines) {
    const tempFile = path.join(os.tmpdir(), 'vscode_temp.magik');
    const output = lines.join('\r\n');

    fs.writeFileSync(tempFile, output);

    await this.magikConsole.sendCommandToTerminal('vs_load');
  }

  async _compileFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const {fileName} = doc;
    const classNames = magikUtils.allClassNames(doc);
    const saveSymbols = classNames.length > 0;
    let classNamesStr;

    if (saveSymbols) {
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

      if (saveSymbols) {
        lines.push('_block');

        lines.push(`vs_save_symbols({${classNamesStr}})`);
        lines.push('_endblock');
        lines.push('$');
      }

      await this._compileText(lines);
    } else if (path.extname(fileName) === '.magik') {
      const procName = 'load_file';
      const argString = `"${fileName}"`;
      const additionalString = saveSymbols
        ? `vs_save_symbols({${classNamesStr}})`
        : undefined;

      await this.magikConsole.sendCommandToTerminal(
        procName,
        argString,
        additionalString
      );
    }

    if (saveSymbols) {
      this._checkFileAfterSaveSymbols();
    }
  }

  async _loadModule() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const {fileName} = doc;

    if (path.extname(fileName) === '.magik') {
      await this.symbolProvider.loadSymbols();

      await this.magikConsole.sendCommandToTerminal(
        'vs_load_file',
        `"${fileName}", _true`,
        'vs_save_symbols()'
      );

      this._checkFileAfterSaveSymbols();
    }
  }

  async _compileSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const text = this.selectedText();
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

    if (className) {
      this._checkFileAfterSaveSymbols();
    }
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
    const regionLines = [...lines];
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

    if (this.magikConsole.isConsoleDoc(doc)) {
      await this.magikConsole.compileText(doc, lines, regionLines);
    } else {
      await this._compileText(lines);
      if (methodName) {
        this._checkFileAfterSaveSymbols();
      }
    }
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
    const regionLines = [...lines];

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

    if (this.magikConsole.isConsoleDoc(doc)) {
      await this.magikConsole.compileText(doc, lines, regionLines);
    } else {
      await this._compileText(lines);
      if (className) {
        this._checkFileAfterSaveSymbols();
      }
    }
  }

  async _compileExtensionMagik() {
    const ext = vscode.extensions.getExtension('GE-Smallworld.magik-vscode');
    if (ext) {
      const fileName = path.join(ext.extensionPath, 'vscode_dev.magik');

      await this.magikConsole.sendCommandToTerminal(
        'load_file',
        `"${fileName}"`
      );
    }
  }

  async _newMagikBuffer(name, outputText, viewColumn) {
    const prefix = name === undefined ? 'buffer' : name;
    const dateStr = new Date().toLocaleDateString().replace(/(\\|\/)/g, '_');
    const fileName = `${prefix} ${dateStr}`;
    const tempDir = os.tmpdir();
    let tempFile = path.join(tempDir, `${fileName}.magik`);
    let count = 1;

    while (fs.existsSync(tempFile)) {
      tempFile = path.join(tempDir, `${fileName} (${count}).magik`);
      count++;
    }

    const str = outputText || '';

    fs.writeFileSync(tempFile, str);

    const lastRow = str.split('\n').length;
    const range = new vscode.Range(lastRow, 0, lastRow, 0);
    vscode.window.showTextDocument(vscode.Uri.file(tempFile), {
      selection: range,
      preview: false,
      viewColumn,
    });
  }

  async _newMagikConsole() {
    await this._newMagikBuffer(
      'console',
      `${magikUtils.MAGIK_PROMPT} \n`,
      vscode.ViewColumn.Beside
    );

    this.magikConsole.restartMonitor();
  }

  async _gotoClipboardText() {
    // To search for selection from the terminal ensure copyOnSelection is set to true:
    // "terminal.integrated.copyOnSelection": true

    const clipboardText = await vscode.env.clipboard.readText();
    await this._gotoText(clipboardText);
  }

  _gotoSymbol(sym, firstColumn = false) {
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    const preview = workbenchConfig.editor.enablePreviewFromCodeNavigation;
    const viewColumn = firstColumn ? vscode.ViewColumn.One : undefined;

    vscode.window.showTextDocument(sym.location.uri, {
      selection: sym.location.range,
      preview,
      viewColumn,
    });

    vscode.commands.executeCommand('editor.unfold', {});
  }

  async gotoFromQuery(
    query,
    magikCommand,
    inherit = false,
    local = false,
    firstColumn = false
  ) {
    let symbols = await this.symbolProvider.getSymbols(
      query,
      inherit,
      local,
      2
    );
    let symbolsLength = symbols.length;

    if (symbolsLength === 0) {
      if (magikCommand) {
        this.magikConsole.showIntegratedTerminal();
        await magikUtils.sendToTerminal(magikCommand);
      }
      return;
    }

    let selectedSymbol;

    if (symbolsLength === 1) {
      selectedSymbol = symbols[0];
    } else if (
      vscode.workspace.getConfiguration('magik-vscode').searchWithClassBrowser
    ) {
      const queryParts = query.split('.');
      const queryLength = queryParts.length;
      const className = queryLength > 1 ? queryParts[0] : '';
      const methodName = queryLength > 1 ? queryParts[1] : queryParts[0];
      this.magikClassBrowser.search(className, methodName);
      return;
    } else {
      // Repeat symbol query with no max number and show candidates in quick pick
      symbols = await this.symbolProvider.getSymbols(query, inherit, local);

      symbolsLength = symbols.length;
      const startTime = new Date().getTime();
      let currentTime;

      for (let i = 0; i < symbolsLength; i++) {
        const sym = symbols[i];
        if (sym._completionDocumentation === undefined) {
          this.resolveSymbolCompletion(sym);
          currentTime = new Date().getTime();
          if (currentTime - startTime >= 200) break;
        }
      }

      selectedSymbol = await this.symbolProvider.selectFromSymbols(
        symbols,
        true
      );
    }

    if (selectedSymbol) {
      const resSymbol = this.resolveWorkspaceSymbol(selectedSymbol, true);
      if (resSymbol) {
        this._gotoSymbol(resSymbol, firstColumn);
      }
    }
  }

  async _gotoText(selectedText) {
    if (selectedText.length === 0) return;

    const text = selectedText.trim();
    let query;
    let command;
    let localOnly = false;

    const match = text.match(/\s\.{2,}\s/);
    if (match) {
      const textSplit = text.split(match[0]);
      query = `^${textSplit[1]}$.^${textSplit[0]}$`;
      command = `vs_goto("^${textSplit[0]}$", "${textSplit[1]}")`;
      localOnly = true;
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

    await this.gotoFromQuery(query, command, false, localOnly);
  }

  provideTerminalLinks(context, token) {
    const line = context.line;
    const links = [];
    let startIndex;
    let length;
    let tooltip;
    let query;
    let command;

    let match = line.match(TERMINAL_TB_REG);
    if (match) {
      startIndex = 0;
      tooltip = `${match[1]}.${match[2]}`;
      length = tooltip.length;
      query = `^${match[1]}$.^${match[2]}$`;
      command = `vs_goto("^${match[2]}$", "${match[1]}")`;
      links.push({
        startIndex,
        length,
        tooltip,
        data: {query, command},
      });
    } else {
      match = line.match(TERMINAL_DEBUG_TB_REG);
      if (match) {
        startIndex = line.indexOf(match[1]);
        length = match[1].length;
        tooltip = `${match[2]}.${match[1]}`;
        query = `^${match[2]}$.^${match[1]}$`;
        command = `vs_goto("^${match[1]}$", "${match[2]}")`;
        links.push({
          startIndex,
          length,
          tooltip,
          data: {query, command},
        });
      }
    }

    match = line.match(PATH_REG);
    if (match) {
      let filePath = match[1];
      // Only add link for parital file path
      if (!fs.existsSync(filePath)) {
        filePath = this.symbolProvider.filePathFromPartial(filePath);
        if (fs.existsSync(filePath)) {
          startIndex = line.indexOf(match[1]);
          let lineNumber;
          if (match[4]) {
            const partialPath = `${match[1]}:${match[4]}`;
            length = partialPath.length;
            lineNumber = Number(match[4]);
            tooltip = `${filePath}:${match[4]}`;
          } else {
            length = match[1].length;
            tooltip = filePath;
          }
          links.push({
            startIndex,
            length,
            tooltip,
            data: {fileName: filePath, lineNumber},
          });
        }
      }
    }

    return links;
  }

  async handleTerminalLink(link) {
    if (link.data.fileName) {
      this._openFile(link.data);
    } else {
      await this.gotoFromQuery(link.data.query, link.data.command, false, true);
    }
  }

  findDefinition(fileName, word, kind) {
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
        `(^|\\s+)_method\\s+.+?\\.\\s*${searchName}\\s*(\\(|<<|\\[|^<<)`
      );
    } else {
      const searchName = word.replace(/\?/g, '\\?');
      if (kind !== vscode.SymbolKind.Variable) {
        if (kind) {
          // Search for exact name if resolving a symbol
          methodTest = new RegExp(
            `(^|\\s+)_method\\s+.+?\\.\\s*${searchName}\\s*$`
          );
        } else {
          methodTest = new RegExp(
            `(^|\\s+)_method\\s+.+?\\.\\s*${searchName}\\s*($|\\(|<<|\\[|^<<)`
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

  _findGlobal(fileName, word) {
    const lines = this.getFileLines(fileName);
    if (!lines) return;

    const searchName = word.replace(/\?/g, '\\?');
    const lineCount = lines.length;

    const globalTest = new RegExp(
      `^\\s*_global\\s*(_constant\\s*)?${searchName}\\s*<<`
    );
    const defineTest = new RegExp(
      `(condition\\.\\s*define_condition|def_slotted_exemplar)\\s*\\(\\s*:${searchName}($|[^\\w!?])`
    );
    const defineTestMultiLine = new RegExp(
      `(condition\\.\\s*define_condition|def_slotted_exemplar)\\s*\\(\\s*$`
    );

    for (let row = 0; row < lineCount; row++) {
      let text = magikUtils.stringBeforeComment(lines[row]);
      let index = text.search(globalTest);

      if (index === -1) {
        index = text.search(defineTest);
      }

      if (index === -1 && text.search(defineTestMultiLine) !== -1) {
        const nextResult = magikUtils.nextWordInFile(lines, row + 1, 0, true);
        if (nextResult.word === word) {
          row = nextResult.row;
          text = magikUtils.stringBeforeComment(lines[row]);
          index = 0;
        }
      }

      if (index !== -1) {
        index = text.indexOf(word, index);
        const range = new vscode.Range(row, index, row, index + word.length);
        return new vscode.Location(vscode.Uri.file(fileName), range);
      }
    }
  }

  // TODO - only looking in current directory
  async provideReferences(doc, pos) {
    const locs = [];
    const current = magikUtils.currentWord(doc, pos);
    if (current === '') return locs;

    // const lineCount = doc.lineCount;
    // const uri = doc.uri;

    // for (let row = 0; row < lineCount; row++) {
    //   const text = doc.lineAt(row).text;
    //   const index = text.indexOf(current);

    //   if (index !== -1) {
    //     const range = new vscode.Range(row, index, row, index + current.length);
    //     const loc = new vscode.Location(uri, range);
    //     locs.push(loc);
    //   }
    // }

    const def = await this._getCurrentDefinitionSymbol(doc, pos);
    const sym = def.symbol;
    let defFileName;
    let defRow;

    if (sym) {
      const defLoc = sym.location;
      defFileName = defLoc.uri.fsPath;
      defRow = defLoc.range.start.line;
      locs.push(defLoc);
    }

    const currentFileName = doc.fileName;
    const currentDir = path.dirname(currentFileName);
    const files = this._getMagikFilesInDirectory(currentDir);

    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      const fileLines = this.getFileLines(fileName);

      if (fileLines) {
        const lineCount = fileLines.length;
        const uri = vscode.Uri.file(fileName);

        for (let row = 0; row < lineCount; row++) {
          const text = fileLines[row];
          const index = text.indexOf(current);

          if (index !== -1 && (row !== defRow || fileName !== defFileName)) {
            const range = new vscode.Range(
              row,
              index,
              row,
              index + current.length
            );
            const loc = new vscode.Location(uri, range);
            locs.push(loc);
          }
        }
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

    if (
      defTest.type === vscode.SymbolKind.Method ||
      defTest.type === vscode.SymbolKind.Function
    ) {
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
      const fromIndex = text.indexOf('.');
      index = text.indexOf(methodName, fromIndex);
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

  async _gotoPreviousDefinition() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;

    if (this.magikConsole.isConsoleDoc(doc)) {
      await this.magikConsole.showPrevious(editor);
      return;
    }

    const startLine = editor.selection.active.line - 1;
    const testsLength = magikUtils.DEFINITION_TESTS.length;

    for (let row = startLine; row > 0; row--) {
      const text = doc.lineAt(row).text;

      if (text.trim().length > 10) {
        for (let i = 0; i < testsLength; i++) {
          const defTest = magikUtils.DEFINITION_TESTS[i];
          const sym = this._getDefinitionSymbol(doc, row, text, defTest);
          if (sym) {
            this._gotoSymbol(sym);
            return;
          }
        }
      }
    }
  }

  async _gotoNextDefinition() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;

    if (this.magikConsole.isConsoleDoc(doc)) {
      await this.magikConsole.showNext(editor);
      return;
    }

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
            this._gotoSymbol(sym);
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
    return this.symbolProvider.getSymbols(query, false, false, undefined, true);
  }

  resolveWorkspaceSymbol(sym, showWarning = false) {
    if (this.resolveSymbols) {
      const globalName = sym._globalName;
      let loc;
      let startLine;

      try {
        fs.accessSync(sym._fileName, fs.constants.R_OK);
      } catch (err) {
        if (showWarning === true) {
          vscode.window.showWarningMessage(
            `Cannot open file: ${sym._fileName}`
          );
        }
        return;
      }

      if (sym.location.range) {
        startLine = sym.location.range.start.line;
      }

      if (globalName) {
        loc = this._findGlobal(sym._fileName, globalName);
      } else {
        loc = this.findDefinition(sym._fileName, sym._methodName, sym.kind);
      }

      if (loc) {
        // Clear help if start line has changed
        if (startLine && loc.range.start.line !== startLine) {
          sym._completionDocumentation = undefined;
          sym._help = undefined;
        }
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
        this.symbolProvider.globalNames,
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
      let symbols = await this.symbolProvider.getSymbols(
        query,
        inherit,
        false,
        1
      );

      if (symbols.length === 0) {
        query = `^${currentWord}$`;
        symbols = await this.symbolProvider.getSymbols(query, false, false, 2);
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
    const firstColumn = args ? args.firstColumn : undefined;

    if (args && args.query) {
      await this.gotoFromQuery(
        args.query,
        args.command,
        false,
        true,
        firstColumn
      );
      return;
    }

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

    const selectedText = this.selectedText();
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
      this._gotoSymbol(def.symbol, firstColumn);
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
    let query;
    let command;
    let inherit = false;

    if (superMatch) {
      query = `^${superMatch[1]}$.^${def.currentWord}$`;
      command = `vs_goto("^${def.currentWord}$", "${superMatch[1]}")`;
    } else if (def.className) {
      inherit = def.previousWord === '_super' ? '_true' : '_false';
      query = `^${def.className}$.^${def.currentWord}$`;
      command = `vs_goto("^${def.currentWord}$", "${
        def.className
      }", ${inherit})`;
    } else {
      query = `^${def.currentWord}$`;
      command = `vs_goto("^${def.currentWord}$")`;
    }

    await this.gotoFromQuery(query, command, inherit, false, firstColumn);
  }

  async _refreshSymbols() {
    if (this.isDevLoaded()) {
      await this.magikConsole.sendCommandToTerminal('vs_save_symbols');
    } else {
      // Load extension Magik - this will also save the symbols
      await this._compileExtensionMagik();
    }
    setTimeout(
      () => vscode.window.showInformationMessage('Magik symbols saved'),
      2500
    );
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
    loc = this.findDefinition(currentFileName, current);
    if (loc) return loc;
    doneFileNames.push(currentFileName);

    // Check other open files
    for (const fileName of this._currentMagikFiles()) {
      if (
        !doneFileNames.includes(fileName) &&
        path.extname(fileName) === '.magik'
      ) {
        loc = this.findDefinition(fileName, current);
        if (loc) return loc;
        doneFileNames.push(fileName);
      }
    }

    // Check other magik files from the directory
    const files = this._getMagikFilesInDirectory(currentDir);

    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];

      if (!doneFileNames.includes(fileName)) {
        loc = this.findDefinition(fileName, current);
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
      if (sym._completionDocumentation === undefined) {
        this.resolveWorkspaceSymbol(sym);
        if (sym.kind !== vscode.SymbolKind.Class && sym.location.range) {
          this._getMethodHelp(sym, 0);
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  async _getMethodCompletionItems(doc, pos, currentWord, previousWord) {
    let className;
    if (previousWord) {
      className = this._getCurrentReceiver(doc, pos, previousWord);
    }

    if (!className && currentWord.length < 2) {
      return;
    }

    const items = [];
    const inherit = previousWord === '_super';
    const query = className
      ? `^${className}$.^${currentWord}`
      : `^${currentWord}`;

    this.resolveSymbols = false;
    let symbols = await this.symbolProvider.getSymbols(
      query,
      inherit,
      false,
      500
    );
    this.resolveSymbols = true;

    let symbolsLength = symbols.length;

    if (className) {
      const methodNames = {};

      for (let i = 0; i < symbolsLength; i++) {
        const sym = symbols[i];
        const name = sym._methodName;

        if (name) {
          const syms = methodNames[name];
          if (syms) {
            syms.push(sym);
          } else {
            methodNames[name] = [sym];
          }
        }
      }

      symbols = [];

      for (const [name, syms] of Object.entries(methodNames)) {
        if (syms.length > 1) {
          // Enhance query to find first method match - don't show extra super methods
          const methodQuery = `^${className}$.^${name}$`;

          this.resolveSymbols = false;
          // eslint-disable-next-line
          const result = await this.symbolProvider.getSymbols(methodQuery, inherit, false, 1);
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

    symbolsLength = symbols.length;
    const startTime = new Date().getTime();
    let resolve = symbolsLength < 51;
    let currentTime;

    for (let i = 0; i < symbolsLength; i++) {
      const sym = symbols[i];
      const name = sym._methodName;
      const item = new vscode.CompletionItem(
        name,
        vscode.CompletionItemKind.Method
      );

      item.detail = sym.name;

      if (resolve) {
        this.resolveSymbolCompletion(sym);
        const documentation = sym._completionDocumentation;
        if (documentation) {
          item.detail = sym._completionName;
          item.documentation = documentation;
        }
        currentTime = new Date().getTime();
        if (currentTime - startTime >= 150) {
          resolve = false;
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

    if (pos.line > 1) {
      const startLine = new RegExp(`^\\s*${currentWord}`);
      if (
        startLine.test(currentText) &&
        /\.\s*$/.test(doc.lineAt(pos.line - 1).text)
      ) {
        const items = await this._getMethodCompletionItems(
          doc,
          pos,
          currentWord
        );
        return items;
      }
    }

    const items = [];
    const index = currentText.indexOf(
      currentWord,
      pos.character - currentWord.length
    );
    const previousChar = magikUtils.previousCharacter(currentText, index);
    let length;

    if (previousChar === '.') {
      const slots = magikUtils.localSlots(doc, pos);
      length = slots.length;
      for (let i = 0; i < length; i++) {
        const slotName = slots[i];
        if (this.symbolProvider.matchString(slotName, currentWord, 0)) {
          const item = new vscode.CompletionItem(
            slotName,
            vscode.CompletionItemKind.Property
          );
          item.detail = 'Slot';
          item.sortText = `1${slotName}`;
          item.filterText = slotName;
          items.push(item);
        }
      }
    } else {
      const inComment = this._posInComment(pos);

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

      if (/^\s*_pragma\s*\(/.test(currentText)) {
        const pragmaWords = magikUtils.PRAGMA_WORDS;
        length = pragmaWords.length;
        for (let i = 0; i < length; i++) {
          const pragmaWord = pragmaWords[i];
          if (this.symbolProvider.matchString(pragmaWord, currentWord, 0)) {
            const item = new vscode.CompletionItem(
              pragmaWord,
              vscode.CompletionItemKind.Keyword
            );
            item.detail = 'Pragma Keyword';
            item.sortText = `0${pragmaWord}`;
            item.filterText = pragmaWord;
            items.push(item);
          }
        }
      }

      if (!inComment && currentText.startsWith(currentWord)) {
        const methodComplete = 'method'.startsWith(currentWord);
        if (methodComplete || 'private'.startsWith(currentWord)) {
          const className = magikUtils.currentClassName(doc, pos.line);
          if (className) {
            const name = `_method ${className}`;
            const privateName = `_private _method ${className}`;
            let item;

            if (methodComplete) {
              item = new vscode.CompletionItem(
                name,
                vscode.CompletionItemKind.Keyword
              );
              item.detail = 'Keyword';
              item.insertText = `_method ${className}.`;
              item.sortText = '0_method';
              item.filterText = 'method';
              items.push(item);
            }

            item = new vscode.CompletionItem(
              privateName,
              vscode.CompletionItemKind.Keyword
            );
            item.detail = 'Keyword';
            item.insertText = `_private _method ${className}.`;
            item.sortText = '0_private_method';
            if (methodComplete) {
              item.filterText = 'methodprivate';
            } else {
              item.filterText = 'privatemethod';
            }
            items.push(item);
          }
        }

        if ('pragma'.startsWith(currentWord)) {
          const lastPragma = magikUtils.lastPragma(doc, pos.line);
          if (lastPragma) {
            const item = new vscode.CompletionItem(
              lastPragma,
              vscode.CompletionItemKind.Keyword
            );
            item.detail = 'Last _pragma line';
            item.sortText = '0_pragma';
            item.filterText = 'pragma';
            items.push(item);
          }
        }
      }

      const vars = magikVar.getMethodVariables(
        pos,
        this.symbolProvider.classNames,
        this.symbolProvider.classData,
        this.symbolProvider.globalNames
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
          item.sortText = `1${varName}`;
          item.filterText = varName;
          items.push(item);
        }
      }

      if (!inComment) {
        const keywords = magikUtils.MAGIK_KEYWORDS;
        length = keywords.length;
        for (let i = 0; i < length; i++) {
          const key = keywords[i];
          const label = `_${key}`;

          if (key.startsWith(currentWord) || label.startsWith(currentWord)) {
            const item = new vscode.CompletionItem(
              label,
              vscode.CompletionItemKind.Keyword
            );
            item.detail = 'Keyword';
            item.sortText =
              label === this.outdentWord ? `21${key}` : `22${key}`;
            item.filterText = key;
            items.push(item);
          }
        }

        // _endmethod with dollar and newline
        if (
          this.outdentWord === '_endmethod' &&
          ('endmethod'.startsWith(currentWord) ||
            '_endmethod'.startsWith(currentWord))
        ) {
          const item = new vscode.CompletionItem(
            '_endmethod + $',
            vscode.CompletionItemKind.Keyword
          );
          item.detail = 'Keyword';
          item.insertText = '_endmethod\n$\n';
          item.sortText = '20endmethod';
          item.filterText = 'endmethod';
          const insertRange = new vscode.Range(
            pos.line,
            0,
            pos.line,
            currentText.length
          );
          item.range = {replacing: insertRange, inserting: insertRange};
          items.push(item);
        }
      }

      const classNames = this.symbolProvider.classNames;
      length = classNames.length;
      for (let i = 0; i < length; i++) {
        const className = classNames[i];
        if (this.symbolProvider.matchString(className, currentWord, 0)) {
          const item = new vscode.CompletionItem(
            className,
            vscode.CompletionItemKind.Class
          );
          item.detail = 'Class';
          item.sortText = `3${className}`;
          item.filterText = className;
          items.push(item);
        }
      }

      const globalNames = this.symbolProvider.globalNames;
      length = globalNames.length;
      for (let i = 0; i < length; i++) {
        const global = globalNames[i];
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
    }

    return items;
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

    while (lines.length > 0 && lines[0] === '') {
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

      const match = /[\w!?]+\.[\w!?]+\s*(\(|<<|^<<)\s*((?=([\w!?]+))\s*,?\s*)*$/.exec(
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
      pos.character - currentWord.length
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

  selectedRange() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;

    if (
      selection.start.character !== selection.end.character ||
      selection.start.line !== selection.end.line
    ) {
      return new vscode.Range(selection.start, selection.end);
    }
  }

  selectedText() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selRange = this.selectedRange();
    if (selRange) {
      return editor.document.getText(selRange);
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
    if (pos.line < 0 || pos.line > doc.lineCount - 1) return false;

    const lineText = doc.lineAt(pos.line).text;
    const text = magikUtils.stringBeforeComment(lineText);

    return pos.character > text.length;
  }

  _underSourceControl(fileName) {
    let tempDir = fileName;
    let testDir;
    do {
      tempDir = path.dirname(tempDir);
      testDir = path.join(tempDir, '.git');
      if (fs.existsSync(testDir)) {
        return true;
      }
      testDir = path.join(tempDir, '.hg');
      if (fs.existsSync(testDir)) {
        return true;
      }
    } while (!/[/\\]$/.test(tempDir));
    return false;
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

  _getFileHoverString(doc, pos, lineText) {
    const pathReg = /(?:\s|[(['"]|^)((\w:)?[^.'"()[\]]+?\.[^.'"()[\]]+?)(:(\d+))?(?:\s|[)\]'"]|$)/g;

    const firstColumn = this.magikConsole.isConsoleDoc(doc);
    let startIndex = 0;
    let pathMatch;

    while (pathMatch = pathReg.exec(lineText)) { // eslint-disable-line
      let filePath = pathMatch[1];
      const index = lineText.indexOf(filePath, startIndex);

      if (index <= pos.character && index + filePath.length > pos.character) {
        let fileFound = fs.existsSync(filePath);
        if (!fileFound) {
          filePath = this.symbolProvider.filePathFromPartial(filePath);
          fileFound = fs.existsSync(filePath);
        }
        if (fileFound) {
          const lineNumber = pathMatch[4] ? Number(pathMatch[4]) : undefined;
          const openArgs = [{fileName: filePath, firstColumn, lineNumber}];
          const openCommand = vscode.Uri.parse(
            `command:magik.openFile?${encodeURIComponent(
              JSON.stringify(openArgs)
            )}`
          );
          const fileName = path.basename(filePath);
          return `[Open '${fileName}'](${openCommand} "Open file '${filePath}'")`;
        }
        return;
      }

      startIndex = index + 1;
    }
  }

  async _getHoverString(doc, pos) {
    let hoverString = '';

    const lineSeparator = '  \n  \n';
    const inSelection = this._posInSelection(pos);
    const lineText = doc.lineAt(pos.line).text;
    const methodDef = /(^|\s)_method\s/.test(lineText);
    const currentText = inSelection
      ? this.selectedText()
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
        hoverString += `${lineSeparator}$(search)\u2002${searchString}`;
      }

      if (!/^(\d|_)/.test(currentText)) {
        const links = this.provideTerminalLinks({line: lineText}, undefined);
        const tracebackMethod = links.length === 1;
        const inComment = this._posInComment(pos);
        const firstColumn = this.magikConsole.isConsoleDoc(doc);

        if (inSelection || !inComment) {
          let searchCommand;
          if (
            vscode.workspace.getConfiguration('magik-vscode')
              .searchWithClassBrowser
          ) {
            searchCommand = vscode.Uri.parse(
              `command:magik.searchClassBrowser?${encodeURIComponent(
                JSON.stringify([{methodName: currentText}])
              )}`
            );
          } else {
            searchCommand = vscode.Uri.parse(
              `command:magik.searchSymbols?${encodeURIComponent(
                JSON.stringify([{query: currentText}])
              )}`
            );
          }
          hoverString += `${lineSeparator}$(search)\u2002[Search Definitions](${searchCommand} "Search definitions for the current text")`;
        }

        if (!methodDef && !inComment) {
          if (tracebackMethod) {
            const gotoArgs = [
              {
                query: links[0].data.query,
                command: links[0].data.command,
                firstColumn,
              },
            ];
            const gotoCommand = vscode.Uri.parse(
              `command:magik.goto?${encodeURIComponent(
                JSON.stringify(gotoArgs)
              )}`
            );
            hoverString += `${lineSeparator}$(symbol-method)\u2002['${
              links[0].tooltip
            }'](${gotoCommand} "Go To Definition")`;
          } else {
            const gotoArgs = [{position: pos, firstColumn}];
            let addGoto = true;

            if (!inSelection) {
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
                `command:magik.goto?${encodeURIComponent(
                  JSON.stringify(gotoArgs)
                )}`
              );
              hoverString += `${lineSeparator}$(symbol-method)\u2002[Go To Definition](${gotoCommand} "Go To Definition")`;
            }
          }
        }
      }

      const classData = this.symbolProvider.classData[currentText];
      if (
        classData &&
        classData.sourceFile &&
        fs.existsSync(classData.sourceFile)
      ) {
        const firstColumn = this.magikConsole.isConsoleDoc(doc);
        const openArgs = [{fileName: classData.sourceFile, firstColumn}];
        const openCommand = vscode.Uri.parse(
          `command:magik.openFile?${encodeURIComponent(
            JSON.stringify(openArgs)
          )}`
        );
        hoverString += `${lineSeparator}$(symbol-class)\u2002[Open Class](${openCommand} "Open file '${
          classData.sourceFile
        }'")`;
      }
    }

    if (methodDef) {
      const lines = magikUtils.currentRegion(true, pos.line).lines;

      if (lines) {
        await this.symbolProvider.loadSymbols();

        const res = magikUtils.getClassAndMethodName(lines[0]);
        const methodName = res.methodName;

        if (methodName) {
          if (
            this.symbolProvider.classData.method_viewer &&
            this._underSourceControl(doc.fileName)
          ) {
            const historyArgs = [
              {
                text: `mhistory("^${res.displayMethodName}$", "^${
                  res.className
                }$")`,
              },
            ];
            const historyCommand = vscode.Uri.parse(
              `command:magik.runMagik?${encodeURIComponent(
                JSON.stringify(historyArgs)
              )}`
            );
            const fullName = `${res.className}.${res.displayMethodName}`;
            hoverString += `${lineSeparator}$(history)\u2002[Show History](${historyCommand} "Show method history: '${fullName}'")`;
          }

          const parents = [];
          this._parentClasses(res.className, parents);

          // Check if pointing at test method name
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
            const fullName = `${res.className}.${res.displayMethodName}`;
            hoverString += `${lineSeparator}$(testing-run-icon)\u2002[Run Test](${testCommand} "Run Test: '${fullName}'")`;
          }
        }
      }
    }

    const fileString = this._getFileHoverString(doc, pos, lineText);
    if (fileString) {
      hoverString += `${lineSeparator}$(file)\u2002${fileString}`;
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
        // this.magikConsole.showConsole();

        await this.magikConsole.sendCommandToTerminal(
          'vs_run_test',
          `"${res.className}", "${res.methodName}"`
        );
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

    // this.magikConsole.showConsole();

    await this.magikConsole.sendCommandToTerminal(
      'run_tests',
      `{${testClasses.join(', ')}}`
    );
  }

  async _compileMessages() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const fileName = doc.fileName;

    // this.magikConsole.showConsole();

    await this.magikConsole.sendCommandToTerminal(
      'vs_compile_messages',
      `"${fileName}"`
    );
  }

  async _startSmallworldNinja() {
    const ext = vscode.extensions.getExtension('GE-Smallworld.magik-vscode');

    // this.magikConsole.showConsole();

    await this.magikConsole.sendCommandToTerminal(
      'start_ninja',
      `"${ext.extensionPath}"`
    );
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
      fs.accessSync(fileName, fs.constants.R_OK);
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

    const cacheLength = this.fileCache.length;

    for (let index = 0; index < cacheLength; index++) {
      const data = this.fileCache[index];

      if (data[0] === fileName) {
        if (index > Math.floor(FILE_CACHE_SIZE * 0.75) - 1) {
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
        vscode.window.showWarningMessage(`Cannot open file: ${fileName}`);
        return;
      }
    }

    this.fileCache.unshift([fileName, lines]);

    if (cacheLength === FILE_CACHE_SIZE) {
      this.fileCache.pop();
    }

    return lines;
  }

  isDevLoaded() {
    return this.symbolProvider.globalData.vs_save_symbols !== undefined;
  }
}

module.exports = MagikVSCode;
