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
];

class MagikSymbolProvider {
  constructor(vscode) {
    this.classData = {};
    this.classNames = [];

    this.globalData = {};
    this.globalNames = [...DEFAULT_GLOBALS];

    this.vscode = vscode;

    this.symbolOrder = [
      this.vscode.SymbolKind.Class,
      this.vscode.SymbolKind.Constant,
      this.vscode.SymbolKind.Function,
      this.vscode.SymbolKind.Variable,
      this.vscode.SymbolKind.Method,
    ];
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
          variable: data[1] === '1',
        };
        if (data[2] !== '') {
          methodData.sourceFile = data[2];
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

  _getMethodSymbol(name, fileName, methodData) {
    let sym = methodData.methodSymbol;
    if (!sym) {
      const type = methodData.variable
        ? this.vscode.SymbolKind.Variable
        : this.vscode.SymbolKind.Method;
      const loc = new this.vscode.Location(
        this.vscode.Uri.file(fileName),
        undefined
      );
      const mName = methodData.name;

      sym = new this.vscode.SymbolInformation(name, type, undefined, loc);
      sym._fileName = fileName;
      sym._methodName = mName;

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
      let type;
      if (globalData.condition) {
        type = this.vscode.SymbolKind.Constant;
      } else if (globalData.procedure) {
        type = this.vscode.SymbolKind.Function;
      } else {
        type = this.vscode.SymbolKind.Class;
      }
      const loc = new this.vscode.Location(
        this.vscode.Uri.file(fileName),
        undefined
      );

      sym = new this.vscode.SymbolInformation(name, type, undefined, loc);
      sym._fileName = fileName;
      sym._globalName = name;
      sym._completionText = name;

      globalData.globalSymbol = sym;
    }
    return sym;
  }

  matchString(string, query, matchType) {
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

      if (this.matchString(globalName, globalString, matchType)) {
        const data = this.globalData[globalName];
        const fileName = data.sourceFile;

        if (fileName) {
          const sym = this._getGlobalSymbol(globalName, fileName, data);

          symbols.push(sym);

          if (symbols.length === max) return;
        }
      }
    }
  }

  async getSymbols(
    query,
    inheritOnly = false,
    max = 500,
    searchClasses = false
  ) {
    await this.loadSymbols();

    const queryString = query.replace(/\s+/g, '');
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

    const symbols = [];
    const doneMethods = [];
    const classLength = this.classNames.length;

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

    symbols.sort((a, b) => {
      const indexA = this.symbolOrder[a.kind];
      const indexB = this.symbolOrder[b.kind];
      if (indexA === indexB) {
        return a.name.localeCompare(b.name);
      }
      return indexA - indexB;
    });

    return symbols;
  }
}

module.exports = MagikSymbolProvider;
