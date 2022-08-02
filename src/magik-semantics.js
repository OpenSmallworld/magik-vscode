'use strict';

const vscode = require('vscode'); // eslint-disable-line
const MagikUtils = require('./utils/magik-utils');
const MagikVar = require('./magik-variables');

const TOKEN_TYPES = ['class', 'parameter', 'variable'];
const TOKEN_MODIFIERS = ['readonly', 'defaultLibrary'];

const GLOBALS_TO_IGNORE = ['def_slotted_exemplar', 'def_mixin'];

class MagikSemantics {
  constructor(magikVSCode, symbolProvider, context) {
    const magikFile = {
      scheme: 'file',
      language: 'magik',
    };

    this.magikVSCode = magikVSCode;
    this.symbolProvider = symbolProvider;
    this.legend = new vscode.SemanticTokensLegend(TOKEN_TYPES, TOKEN_MODIFIERS);

    context.subscriptions.push(
      vscode.languages.registerDocumentRangeSemanticTokensProvider(
        magikFile,
        this,
        this.legend
      )
    );
  }

  _regionStartTest(testString) {
    return !testString.includes('"') && (/(^|\s+)_method\s+/.test(testString) || /(^|(?<=[^\w!?]))_proc\s*[|@\w!?]*\s*\(/.test(testString));
  }

  _addTokens(tokensBuilder, doc, lines, startRow) {
    const classNames = this.symbolProvider.classNames;
    const globalNames = this.symbolProvider.globalNames;

    let assignedVars;
    let endRow = -1;

    for (let row = 0; row < lines.length; row++) {
      const line = lines[row];
      if (/^\s*_pragma/.test(line)) continue;

      const reg = /[\w!?]+/g;
      const text = MagikUtils.stringBeforeComment(line);
      const testString = MagikUtils.removeStrings(text);
      let startIndex = 0;
      let match;

      if (row === endRow) {
        assignedVars = undefined;
      } else if (row === 0 || this._regionStartTest(line)) {
        const region = MagikUtils.getRegion(doc, false, startRow + row);
        const regionLines = region.lines;

        if (regionLines) {
          assignedVars = MagikVar.getVariables(
            regionLines,
            region.firstRow,
            classNames,
            this.symbolProvider.classData,
            globalNames,
            []
          );

          endRow = region.lastRow - startRow;
        }
      }

      while (match = reg.exec(testString)) { // eslint-disable-line
        const name = match[0];
        let index = match.index;

        const preChar = testString[index - 1];

        if (
          name[0] !== '_' &&
          preChar !== '.' &&
          preChar !== ':' &&
          Number.isNaN(Number(name))
        ) {
          if (globalNames.indexOf(name) !== -1 && GLOBALS_TO_IGNORE.indexOf(name) === -1) {
            index = text.indexOf(name, startIndex);
            tokensBuilder.push(startRow + row, index, name.length, 2, 2);
          } else if (assignedVars && assignedVars[name]) {
            index = text.indexOf(name, startIndex);
            tokensBuilder.push(
              startRow + row,
              index,
              name.length,
              assignedVars[name].param ? 1 : 2
            );
          } else if (classNames.indexOf(name) !== -1) {
            index = text.indexOf(name, startIndex);
            tokensBuilder.push(startRow + row, index, name.length, 0);
          }
        }

        startIndex = index + name.length;
      }
    }
  }

  provideDocumentRangeSemanticTokens(doc, range) {
    const tokensBuilder = new vscode.SemanticTokensBuilder(this.legend);

    const lines = [];
    const start = range.start.line;
    const end = range.end.line + 1;

    for (let i = start; i < end; i++) {
      lines.push(doc.lineAt(i).text);
    }

    this._addTokens(tokensBuilder, doc, lines, start);

    return tokensBuilder.build();
  }
}

module.exports = MagikSemantics;
