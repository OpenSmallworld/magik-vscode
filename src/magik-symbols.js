'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

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
  'events_thread',
  'string_output_stream',
];

const SYMBOLS_FILENAME = 'vscode_symbols.txt';

class MagikSymbolProvider {
  constructor(vscode, context) {
    this.classData = {};
    this.classNames = [];

    this.globalData = {};
    this.globalNames = [...DEFAULT_GLOBALS];

    this.vscode = vscode;
    this.magikVSCode = undefined;

    this.symbolOrder = [
      this.vscode.SymbolKind.Class,
      this.vscode.SymbolKind.Constant,
      this.vscode.SymbolKind.Property,
      this.vscode.SymbolKind.Variable,
      this.vscode.SymbolKind.Method,
      this.vscode.SymbolKind.Function,
    ];
    this.symbolIcons = {};
    this.symbolIcons[vscode.SymbolKind.Method] = 'symbol-method';
    this.symbolIcons[vscode.SymbolKind.Function] = 'symbol-method';
    this.symbolIcons[vscode.SymbolKind.Variable] = 'symbol-variable';
    this.symbolIcons[vscode.SymbolKind.Class] = 'symbol-class';
    this.symbolIcons[vscode.SymbolKind.Constant] = 'symbol-constant';
    this.symbolIcons[vscode.SymbolKind.Property] = 'symbol-property';

    this._quickPick = undefined;

    this._lastQuery = '';
    this._lastGotoRange = undefined;

    this._viewColumn = undefined;

    context.subscriptions.push(
      vscode.commands.registerCommand('magik.searchSymbols', (args) =>
        this.searchSymbols(args)
      )
    );
  }

  async _wait(ms) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  async loadSymbols() {
    const symbolFile = path.join(os.tmpdir(), SYMBOLS_FILENAME);
    if (!fs.existsSync(symbolFile)) return;

    const input = fs.createReadStream(symbolFile);
    const rl = readline.createInterface({input});

    const newClassData = {};
    const newGlobalData = {};
    const newGlobalNames = [...DEFAULT_GLOBALS];

    let update = false;

    rl.on('line', (line) => {
      const condition = line.startsWith('CONDITION|');

      if (condition || line.startsWith('GLOBAL|')) {
        const globalParts = line.split('|');
        const globalName = globalParts[1];
        let globalSourceFile;

        if (globalParts.length > 2) {
          globalSourceFile = globalParts[2];
        }

        newGlobalNames.push(globalName);
        newGlobalData[globalName] = {
          sourceFile: globalSourceFile,
          condition,
          procedure: !condition,
        };

        return;
      }

      if (line.startsWith('UPDATE:')) {
        update = true;
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
          private: data[1] === '1',
          variable: data[2] === '1',
        };
        if (data[3] !== '') {
          methodData.sourceFile = data[3];
        }
        methods.push(methodData);
      }

      newClassData[className] = {
        sourceFile: classSourceFile,
        parents,
        methods,
      };
    });

    let done = false;
    rl.on('close', () => {
      done = true;
    });

    for (let i = 0; i < 100; i++) {
      await this._wait(20); //eslint-disable-line
      if (done) {
        if (update) {
          this.classData = {...this.classData, ...newClassData};
        } else {
          this.classData = newClassData;
          this.globalData = newGlobalData;
          this.globalNames = newGlobalNames;
        }
        this.classNames = Object.keys(this.classData);
        try {
          fs.unlinkSync(symbolFile);
        } catch (err) {}
        return;
      }
    }
  }

  _getIcon(kind) {
    return this.symbolIcons[kind] || 'symbol-misc';
  }

  _getMethodSymbol(name, fileName, methodData) {
    let sym = methodData.methodSymbol;
    if (!sym) {
      let kind;
      if (methodData.variable) {
        kind = this.vscode.SymbolKind.Variable;
      } else if (methodData.private) {
        kind = this.vscode.SymbolKind.Function;
      } else {
        kind = this.vscode.SymbolKind.Method;
      }
      const loc = new this.vscode.Location(
        this.vscode.Uri.file(fileName),
        undefined
      );
      const mName = methodData.name;

      sym = new this.vscode.SymbolInformation(name, kind, undefined, loc);
      sym._fileName = fileName;
      sym._methodName = mName;
      sym._icon = this._getIcon(kind);
      sym._order = this.symbolOrder.indexOf(kind);

      const length = mName.length;
      const last = mName[length - 1];
      if (last === ')') {
        sym._completionText = mName.substring(0, length - 1);
      } else if (last === '<') {
        sym._completionText = `${mName.substring(0, length - 2)} << `;
      } else {
        sym._completionText = mName;
      }

      methodData.methodSymbol = sym;
    }
    return sym;
  }

  _getGlobalSymbol(name, fileName, globalData) {
    let sym = globalData.globalSymbol;
    if (!sym) {
      let kind;
      if (globalData.condition) {
        kind = this.vscode.SymbolKind.Constant;
      } else if (globalData.procedure) {
        kind = this.vscode.SymbolKind.Property;
      } else {
        kind = this.vscode.SymbolKind.Class;
      }
      const loc = new this.vscode.Location(
        this.vscode.Uri.file(fileName),
        undefined
      );

      sym = new this.vscode.SymbolInformation(name, kind, undefined, loc);
      sym._fileName = fileName;
      sym._globalName = name;
      sym._completionText = name;
      sym._icon = this._getIcon(kind);
      sym._order = this.symbolOrder.indexOf(kind);

      globalData.globalSymbol = sym;
    }
    return sym;
  }

  _matchScore(string, query) {
    const length = query.length;
    if (length > string.length) return 0;

    const matches = [];
    let index = -1;
    let total = 1;
    let gaps = 0;

    for (let i = 0; i < length; i++) {
      const c = query[i];

      index = string.indexOf(c, index + 1);
      if (index === -1) return 0;

      if (c !== '.') {
        const start = matches.length - 1;
        let score = 0;
        let lastIndex = index;
        let otherIndex;

        for (let j = start; j > -1; j--) {
          otherIndex = matches[j];
          if (lastIndex - otherIndex === 1) {
            lastIndex = otherIndex;
            score++;
          } else {
            break;
          }
        }

        if (start !== -1 && score === 0) {
          gaps++;
        }

        matches.push(index);
        total += score;
      }
    }

    total = Math.max(1, total - gaps);

    return total;
  }

  matchString(string, query, matchType) {
    if (matchType === 0) {
      return this._matchScore(string, query);
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
        this.matchString(methodData.name, methodString, methodMatchType)
      ) {
        let fileName = methodData.sourceFile;
        if (!fileName) {
          fileName = sourceFile;
        }
        const sym = this._getMethodSymbol(name, fileName, methodData);

        symbols.push(sym);
        doneMethods.push(name);

        if (symbols.length === max) return;
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

        if (symbols.length === max) return;
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

      if (symbols.length === max) return;
    }

    if (symbols.length === 0) {
      for (let parentIndex = 0; parentIndex < parentsLength; parentIndex++) {
        this._findSuperMethods(
          parents[parentIndex],
          methodString,
          symbols,
          doneMethods,
          methodMatchType,
          max
        );

        if (symbols.length === max) return;
      }
    }
  }

  _findGlobals(globalString, symbols, matchType, max, searchClasses) {
    if (searchClasses) {
      const classLength = this.classNames.length;

      for (let index = 0; index < classLength; index++) {
        const className = this.classNames[index];

        if (this.matchString(className, globalString, matchType)) {
          const data = this.classData[className];
          const sym = this._getGlobalSymbol(className, data.sourceFile, data);

          symbols.push(sym);

          if (symbols.length === max) return;
        }
      }
    }

    const globalLength = this.globalNames.length;

    for (let index = 0; index < globalLength; index++) {
      const globalName = this.globalNames[index];
      const data = this.globalData[globalName];

      if (
        data &&
        data.sourceFile &&
        this.matchString(globalName, globalString, matchType)
      ) {
        const sym = this._getGlobalSymbol(globalName, data.sourceFile, data);

        symbols.push(sym);

        if (symbols.length === max) return;
      }
    }
  }

  _sortSymbols(classString, methodString, symbols) {
    const origQuery = classString
      ? `${classString}.${methodString}`
      : methodString;

    symbols.sort((a, b) => {
      const orderA = a._order;
      const orderB = b._order;

      // if (classString) {
      //   orderA = orderA < 4 ? 1 : 0;
      //   orderB = orderB < 4 ? 1 : 0;
      // }

      if (orderA === orderB) {
        let scoreA = this._matchScore(a.name, origQuery);
        let scoreB = this._matchScore(b.name, origQuery);

        if (scoreA === 0 && a._methodName) {
          scoreA = this._matchScore(a._methodName, methodString);
        }
        if (scoreB === 0 && b._methodName) {
          scoreB = this._matchScore(b._methodName, methodString);
        }

        if (scoreA === scoreB) {
          return a.name.localeCompare(b.name);
        }

        return scoreB - scoreA;
      }

      return orderA - orderB;
    });
  }

  async getSymbols(
    query,
    inheritOnly = false,
    localOnly = false,
    max,
    searchClasses = false
  ) {
    await this.loadSymbols();

    if (max === undefined) {
      max =
        this.vscode.workspace.getConfiguration('magik-vscode')
          .maxSearchResults || 500;
    }

    const queryString = query.replace(/\s+/g, '');
    const queryParts = queryString.split('.');
    let classString;
    let methodString;
    let classMatchType = 0;
    let methodMatchType = 0;

    if (queryParts.length > 1) {
      classString = queryParts[0];
      methodString = queryParts[1];
    } else {
      methodString = queryParts[0];
    }

    if (classString) {
      if (
        classString[0] === '^' &&
        classString[classString.length - 1] === '$'
      ) {
        classMatchType = 1;
        classString = classString.substring(1, classString.length - 1);
      } else if (classString[0] === '^') {
        classMatchType = 2;
        classString = classString.substring(1, classString.length);
      } else if (classString[classString.length - 1] === '$') {
        classMatchType = 3;
        classString = classString.substring(0, classString.length - 1);
      }
    }
    if (
      methodString[0] === '^' &&
      methodString[methodString.length - 1] === '$'
    ) {
      methodMatchType = 1;
      methodString = methodString.substring(1, methodString.length - 1);
    } else if (methodString[0] === '^') {
      methodMatchType = 2;
      methodString = methodString.substring(1, methodString.length);
    } else if (methodString[methodString.length - 1] === '$') {
      methodMatchType = 3;
      methodString = methodString.substring(0, methodString.length - 1);
    }

    if (
      (classString && classString.length < 2) ||
      (!classString && methodString < 2)
    ) {
      return [];
    }

    const symbols = [];
    const doneMethods = [];
    const classLength = this.classNames.length;
    const checkParents = classString && !localOnly;

    for (let classIndex = 0; classIndex < classLength; classIndex++) {
      const className = this.classNames[classIndex];

      if (
        !classString ||
        this.matchString(className, classString, classMatchType)
      ) {
        if (inheritOnly) {
          this._findSuperMethods(
            className,
            methodString,
            symbols,
            doneMethods,
            methodMatchType,
            max,
            1
          );
        } else {
          this._findMethods(
            className,
            methodString,
            symbols,
            doneMethods,
            checkParents,
            methodMatchType,
            max,
            1
          );
        }

        if (symbols.length === max) break;
      }
    }

    if (!classString && symbols.length < max) {
      this._findGlobals(
        methodString,
        symbols,
        methodMatchType,
        max,
        searchClasses
      );
    }

    this._sortSymbols(classString, methodString, symbols);

    return symbols;
  }

  _gotoSymbol(sym) {
    const resSym = this.magikVSCode.resolveWorkspaceSymbol(sym);
    if (resSym) {
      const resSymRange = resSym.location.range;
      const workbenchConfig = this.vscode.workspace.getConfiguration('workbench');
      const preview = workbenchConfig.editor.enablePreviewFromCodeNavigation;

      this._lastGotoRange = resSymRange;

      this.vscode.window.showTextDocument(resSym.location.uri, {
        selection: resSymRange,
        viewColumn: this._viewColumn,
        preview,
      });

      this.vscode.commands.executeCommand('editor.unfold', {});
    }
  }

  _getSearchList(symbols, showDetail) {
    const list = [];
    const symbolsLength = symbols.length;

    for (let index = 0; index < symbolsLength; index++) {
      const sym = symbols[index];
      const documentation = sym._completionDocumentation;
      let detail;

      if (showDetail && documentation !== undefined && documentation !== '') {
        const paramString = sym._help.signatures[0]._paramString;
        if (paramString === '') {
          detail = `\u2002 ${documentation}`;
        } else {
          const documentationString =
            documentation === ''
              ? documentation
              : `$(ellipsis) ${documentation}`;
          const lastChar = sym.name[sym.name.length - 1];
          if (lastChar === ')') {
            detail = `\u2002 (${paramString}) ${documentationString}`;
          } else if (lastChar === '<') {
            detail = `\u2002 ${documentation}`;
          } else {
            detail = `\u2002 ${paramString} ${documentationString}`;
          }
        }
      }

      // Using Function for private method
      const label =
        sym.kind === this.vscode.SymbolKind.Function
          ? `$(${sym._icon})\u2009$(lock) ${sym.name}`
          : `$(${sym._icon}) ${sym.name}`;

      list.push({
        label,
        description: sym._fileName,
        detail,
        alwaysShow: true,
        symbol: sym,
      });
    }

    return list;
  }

  async selectFromSymbols(symbols, showDetail = true) {
    const list = this._getSearchList(symbols, showDetail);

    const target = await this.vscode.window.showQuickPick(list, {
      placeHolder: 'Please select a definition',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (target) {
      return target.symbol;
    }
  }

  _debounce(callback, wait) {
    let timeout;
    return (...args) => {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => callback.apply(context, args), wait);
    };
  }

  async _updateQuickPick() {
    const value = this._quickPick.value;

    if (value.length > 1) {
      const symbols = await this.getSymbols(
        value,
        false,
        false,
        undefined,
        true
      );
      const symbolsLength = symbols.length;
      const startTime = new Date().getTime();
      let currentTime;

      for (let i = 0; i < symbolsLength; i++) {
        const sym = symbols[i];
        if (sym._completionDocumentation === undefined) {
          this.magikVSCode.resolveSymbolCompletion(sym);
          currentTime = new Date().getTime();
          if (currentTime - startTime >= 200) break;
        }
      }

      const list = this._getSearchList(symbols, true);

      this._quickPick.items = list;
    } else {
      this._quickPick.items = [];
    }
  }

  _createQuickPick() {
    if (!this._quickPick) {
      this._quickPick = this.vscode.window.createQuickPick();
      this._quickPick.placeholder =
        'Search definitions  (class.method or method or class, supports ^ and $)';

      this._quickPick.onDidChangeValue(
        this._debounce(() => {
          this._lastQuery = this._quickPick.value;
          this._updateQuickPick();
        }, 300)
      );

      this._quickPick.onDidAccept(() => {
        const selection = this._quickPick.selectedItems;
        if (selection.length > 0) {
          this._gotoSymbol(selection[0].symbol);
        }
      });
    }

    this._quickPick.items = [];
  }

  _rangesEqual(rangeA, rangeB) {
    if (rangeA === undefined && rangeB === undefined) {
      return false;
    }
    if (
      (rangeA === undefined && rangeB !== undefined) ||
      (rangeA !== undefined && rangeB === undefined)
    ) {
      return false;
    }
    return rangeA.isEqual(rangeB);
  }

  async searchSymbols(args) {
    let query = this._lastQuery;

    if (args && args.query) {
      query = args.query;
      this._lastQuery = query;
    } else if (
      !this._rangesEqual(this.magikVSCode.selectedRange(), this._lastGotoRange)
    ) {
      const selection = this.magikVSCode.selectedText();
      if (selection && selection !== '') {
        query = selection;
        this._lastQuery = query;
      }
      this._lastGotoRange = undefined;
    }

    this._viewColumn = args ? args.viewColumn : undefined;

    this._createQuickPick();
    this._quickPick.value = query;
    this._quickPick.show();
    this._updateQuickPick();
  }

  filePathFromPartial(patialPath) {
    for (const data of Object.values(this.classData)) {
      const sourceFile = data.sourceFile;
      if (sourceFile !== undefined && sourceFile.endsWith(patialPath)) {
        return sourceFile;
      }
    }
    for (const data of Object.values(this.globalData)) {
      const sourceFile = data.sourceFile;
      if (sourceFile !== undefined && sourceFile.endsWith(patialPath)) {
        return sourceFile;
      }
    }
  }
}

module.exports = MagikSymbolProvider;
