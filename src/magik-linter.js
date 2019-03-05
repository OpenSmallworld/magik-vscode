'use strict';

const vscode = require('vscode'); // eslint-disable-line
const magikUtils = require('./magik-utils');

const VAR_TEST = /[a-zA-Z0-9_\\?\\!]+/g;
const VAR_IGNORE_WORDS = ['error', 'warning', 'cond']; // FIXME - need all globals (other than classes)
const VAR_IGNORE_PREV_CHARS = ['.', ':', '"', '%', '|', '@'];

class MagikLinter {
  constructor(magikVSCode, context) {
    const magikFile = {
      scheme: 'file',
      language: 'magik',
    };

    this.magikVSCode = magikVSCode;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(
      'magik'
    );

    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      const ext = doc.uri.fsPath.split('.').slice(-1)[0];
      if (ext === 'magik') {
        await this._checkMagik(doc);
      }
    });

    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const ext = doc.uri.fsPath.split('.').slice(-1)[0];
      if (ext === 'magik') {
        await this._checkMagik(doc);
      }
    });

    vscode.workspace.onDidCloseTextDocument((doc) => {
      this.diagnosticCollection.delete(doc.uri);
    });

    context.subscriptions.push(
      vscode.commands.registerCommand('magik.indentMethod', () =>
        this._indentMagik()
      )
    );

    context.subscriptions.push(
      vscode.languages.registerOnTypeFormattingEditProvider(
        magikFile,
        this,
        ' ',
        '.',
        '(',
        '\n'
      )
    );
  }

  async _addUnderscore(doc, pos, ch) {
    const line = doc.lineAt(pos.line);
    const lineText = line.text;
    const text = lineText.slice(0, pos.character);
    const textLength = text.length;

    // Don't update in a comment
    const noStrings = magikUtils.removeStrings(text);
    const hashIndex = noStrings.indexOf('#');
    if (hashIndex !== -1 && hashIndex < textLength) return;

    // Don't update in a string
    let quotesCount = 0;
    for (let i = 0; i < textLength; i++) {
      if (text[i] === '"' && (i === 0 || text[i - 1] !== '%')) {
        quotesCount++;
      }
    }
    if (quotesCount % 2) return;

    let keywords;
    switch (ch) {
      case '.':
        keywords = magikUtils.MAGIK_VARIABLE_KEYWORDS;
        break;
      case '(':
        keywords = ['proc', 'loopbody'];
        break;
      default:
        keywords = magikUtils.MAGIK_KEYWORDS;
    }
    const keywordsLength = keywords.length;

    for (let index = 0; index < keywordsLength; index++) {
      const keyword = keywords[index];
      const length = keyword.length;

      if (length <= textLength) {
        let last = text.slice(-length - 1).trim();

        if (ch === '.' || ch === '(') {
          last = last.slice(0, last.length - 1);
        }

        if (last === keyword) {
          if (ch === '') {
            if (
              length === textLength ||
              text[textLength - length - 1].search(magikUtils.INVALID_CHAR) ===
                0
            ) {
              // Make the change now before checking the indentation
              const edit = new vscode.WorkspaceEdit();
              const insertPos = new vscode.Position(
                pos.line,
                pos.character - length
              );
              edit.insert(doc.uri, insertPos, '_');
            await vscode.workspace.applyEdit(edit); // eslint-disable-line
            }
          } else if (
            length + 1 === textLength ||
            text[textLength - length - 2].search(magikUtils.INVALID_CHAR) === 0
          ) {
            return vscode.TextEdit.insert(
              new vscode.Position(pos.line, pos.character - length - 1),
              '_'
            );
          }
        }
      }
    }
  }

  _cancelAssignIndent(testString, startKeyword) {
    let cancelWords = magikUtils.END_ASSIGN_WORDS;
    if (startKeyword) {
      const pairs = [
        ['_if', '_endif'],
        ['_for', '_endloop'],
        ['_loop', '_endloop'],
        ['_over', '_endloop'],
        ['_while', '_endloop'],
      ];
      for (const [start, end] of pairs) {
        if (startKeyword === start) {
          cancelWords = [end];
          break;
        }
      }
    }

    for (let i = 0; i < cancelWords.length; i++) {
      const word = cancelWords[i];
      if (
        testString.startsWith(word) ||
        testString.endsWith(` ${word}`) ||
        testString.endsWith(`;${word}`)
      ) {
        return true;
      }
    }
    return false;
  }

  _methodStartTest(testString) {
    return /(^|\s+)_method\s+/.test(testString);
  }

  _procAssignTest(testString) {
    if (/(;|\s+)_endproc/.test(testString)) {
      return false;
    }
    return /[a-zA-Z0-9_?!]+\s*<<\s*_proc\s*[@a-zA-Z0-9_?!]*\s*\(.*/.test(
      testString
    );
  }

  _statementAssignTest(testString) {
    const pairs = [
      ['_if', '_endif'],
      ['_for', '_endloop'],
      ['_loop', '_endloop'],
      ['_over', '_endloop'],
      ['_while', '_endloop'],
    ];

    let r;
    for (const [start, end] of pairs) {
      r = new RegExp(`(;|\\s+)${end}`);
      if (!r.test(testString)) {
        r = new RegExp(`[a-zA-Z0-9_\\?\\!]+\\s*<<\\s*${start}\\s*`);
        if (r.test(testString)) {
          return start;
        }
      }
    }
  }

  _arrowAssignTest(testString) {
    return testString.slice(-2) === '<<';
  }

  async _indentMagikLines(lines, firstRow, currentRow, checkOnly) {
    const lineIndents = [];

    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;

    const incBrackets = /[({]/g;
    const decBrackets = /[)}]/g;
    let indent = 0;
    let tempIndent = false;
    let assignIndent = false;
    let arrowAssignRow;
    let assignIndentKeyword;

    for (let row = 0; row < lines.length; row++) {
      const text = lines[row];
      const textLength = text.length;
      let testString = text.trim();
      let start = text.search(/\S/);
      let matches;

      if (start === -1) start = textLength;

      if (testString !== '#') {
        const decWordsLength = magikUtils.INDENT_DEC_WORDS.length;
        for (let i = 0; i < decWordsLength; i++) {
          if (testString.startsWith(magikUtils.INDENT_DEC_WORDS[i])) {
            indent--;
            break;
          }
        }
      }

      const indentText = indent === 0 ? '' : new Array(indent + 1).join('\t');

      lineIndents.push(indent);

      if (
        !checkOnly &&
        indentText !== text.slice(0, start) &&
        (!currentRow || firstRow + row === currentRow)
      ) {
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(
          firstRow + row,
          0,
          firstRow + row,
          start
        );
        edit.replace(doc.uri, range, indentText);
        await vscode.workspace.applyEdit(edit); // eslint-disable-line
      }

      if (firstRow + row === currentRow) return;

      if (testString[0] !== '#') {
        testString = testString.split('#')[0].trim();

        if (arrowAssignRow !== undefined) {
          if (row === arrowAssignRow + 1) {
            const startAssignWordsLength = magikUtils.START_ASSIGN_WORDS.length;
            for (let i = 0; i < startAssignWordsLength; i++) {
              if (testString.startsWith(magikUtils.START_ASSIGN_WORDS[i])) {
                assignIndentKeyword = magikUtils.START_ASSIGN_WORDS[i];
                break;
              }
            }
            if (!assignIndentKeyword) {
              indent--;
              arrowAssignRow = undefined;
            }
          }
          if (
            arrowAssignRow !== undefined &&
            this._cancelAssignIndent(testString, assignIndentKeyword)
          ) {
            indent--;
            arrowAssignRow = undefined;
            assignIndentKeyword = undefined;
          }
        } else if (assignIndent) {
          if (this._cancelAssignIndent(testString, assignIndentKeyword)) {
            indent--;
            assignIndent = false;
            assignIndentKeyword = undefined;
          }
        } else if (tempIndent) {
          indent--;
          tempIndent = false;
        }

        if (this._methodStartTest(testString)) {
          indent++;
        } else {
          const statementAssignKeyword = this._statementAssignTest(testString);
          if (statementAssignKeyword) {
            indent++;
            assignIndent = true;
            assignIndentKeyword = statementAssignKeyword;
          } else if (this._procAssignTest(testString)) {
            indent += 2;
            assignIndent = true;
          } else {
            const incWordsLength = magikUtils.INDENT_INC_WORDS.length;
            for (let i = 0; i < incWordsLength; i++) {
              const iWord = magikUtils.INDENT_INC_WORDS[i];
              if (testString === iWord || testString.startsWith(`${iWord} `)) {
                indent++;
                break;
              }
            }
          }
        }

        if (this._arrowAssignTest(testString)) {
          indent++;
          arrowAssignRow = row;
          assignIndentKeyword = undefined;
        } else {
          const endWordsLength = magikUtils.END_WORDS.length;
          for (let i = 0; i < endWordsLength; i++) {
            if (testString.endsWith(magikUtils.END_WORDS[i])) {
              indent++;
              tempIndent = true;
              break;
            }
          }
        }

        // Remove strings before counting brackets
        const noStrings = magikUtils.removeStrings(testString);
        let incCount = 0;
        let decCount = 0;

        matches = noStrings.match(incBrackets);
        if (matches) {
          indent += matches.length;
          incCount = matches.length;
        }
        matches = noStrings.match(decBrackets);
        if (matches) {
          indent -= matches.length;
          decCount = matches.length;
        }
        if (tempIndent && incCount > decCount) {
          indent--;
        }
      } else if (arrowAssignRow !== undefined) {
        arrowAssignRow++;
      }
    }

    return lineIndents;
  }

  async _indentMagik() {
    const {lines, firstRow} = magikUtils.currentRegion();
    if (lines) {
      await this._indentMagikLines(lines, firstRow);
    }
  }

  async _getLineIndents(lines, firstRow) {
    const lineIndents = await this._indentMagikLines(
      lines,
      firstRow,
      undefined,
      true
    );
    return lineIndents;
  }

  async provideOnTypeFormattingEdits(doc, pos, ch) {
    if (ch === '\n') {
      if (
        vscode.workspace.getConfiguration('magik-vscode').enableAutoIndentation
      ) {
        const row = pos.line;
        const lastCol = doc.lineAt(row - 1).text.length;
        const lastPos = new vscode.Position(row - 1, lastCol);
        await this._addUnderscore(doc, lastPos, '');
        await this._indentMagik(row - 1);
        await this._indentMagik(row);
      }
    } else {
      const edit = await this._addUnderscore(doc, pos, ch);
      if (edit) {
        return [edit];
      }
    }
  }

  _findAssignedVariables(testString, row, assignedVars) {
    const assignSplit = testString.split('<<');
    const assignSplitLength = assignSplit.length;
    if (assignSplitLength < 2) return;

    let match;

    for (let i = 0; i < assignSplitLength - 1; i++) {
      const assignedTestString = assignSplit[i].split('(').slice(-1)[0];

      while (match = VAR_TEST.exec(assignedTestString)) { // eslint-disable-line
        const varName = match[0];
        const varIndex = match.index;

        if (
          !assignedVars[varName] &&
          Number.isNaN(Number(varName)) &&
          !VAR_IGNORE_WORDS.includes(varName) &&
          !VAR_IGNORE_PREV_CHARS.includes(assignedTestString[varIndex - 1]) &&
          assignedTestString[varIndex] !== '_' &&
          assignedTestString[varIndex + varName.length] !== '('
        ) {
          // FIXME - globals
          const index = testString.indexOf(varName);
          const dynamic =
            testString.substring(index - 9, index) === '_dynamic ';
          assignedVars[varName] = {
            row,
            index,
            count: 1,
            dynamic,
          };
        }
      }
    }
  }

  _checkVariables(doc, diagnostics, lines, firstRow) {
    const assignedVars = magikUtils.getMethodParams(doc, lines, firstRow);
    const end = lines.length - 1;
    const showUndefined = this.magikVSCode.classNames.length > 0;
    let search = false;

    for (let i = 0; i < end; i++) {
      const row = firstRow + i;
      const line = lines[i];
      const testString = line.split('#')[0];
      let match;

      if (search) {
        this._findAssignedVariables(testString, row, assignedVars);

        // TODO - loop scopes
        if (testString.includes('_for ') && testString.includes(' _over ')) {
          const overSplit = testString.split(' _over ');
          const iterTestString = overSplit[0].split('_for ').slice(-1)[0];

          while (match = VAR_TEST.exec(iterTestString)) { // eslint-disable-line
            assignedVars[match[0]] = {
              row,
              index: match.index,
              count: 1,
            };
          }
        }

        while (match = VAR_TEST.exec(testString)) { // eslint-disable-line
          const varName = match[0];
          const varIndex = match.index;

          if (
            Number.isNaN(Number(varName)) &&
            !VAR_IGNORE_WORDS.includes(varName) &&
            !VAR_IGNORE_PREV_CHARS.includes(testString[varIndex - 1]) &&
            testString[varIndex] !== '_' &&
            testString[varIndex + varName.length] !== '('
          ) {
            const data = assignedVars[varName];

            if (
              showUndefined &&
              !data &&
              !this.magikVSCode.classData[varName]
            ) {
              // FIXME - globals
              if (testString.substring(varIndex - 7, varIndex) === '_local ') {
                assignedVars[varName] = {
                  row,
                  index: varIndex,
                  count: 1,
                };
              } else if (
                testString.substring(varIndex - 9, varIndex) === '_dynamic '
              ) {
                assignedVars[varName] = {
                  row,
                  index: varIndex,
                  count: 1,
                  dynamic: true,
                };
              } else {
                const range = new vscode.Range(
                  row,
                  varIndex,
                  row,
                  varIndex + varName.length
                );
                const d = new vscode.Diagnostic(
                  range,
                  `'${varName}' is not defined.`,
                  vscode.DiagnosticSeverity.Error
                );
                diagnostics.push(d);
              }
            }

            if (data && (data.row !== row || data.index !== match.index)) {
              data.count += 1;
            }
          }
        }
      } else if (
        /(\)|<<|\])/.test(testString) ||
        /(^|\s+)_method\s+.*[a-zA-Z0-9_\\?\\!]$/
      ) {
        search = true;
      }
    }

    return assignedVars;
  }

  _checkUnusedVariables(assignedVars, diagnostics) {
    for (const [varName, data] of Object.entries(assignedVars)) {
      if (data.count === 1 && !data.dynamic) {
        const range = new vscode.Range(
          data.row,
          data.index,
          data.row,
          data.index + varName.length
        );
        const msg = data.param
          ? `"${varName}" is never used.`
          : `"${varName}" is defined but never used.`;
        const d = new vscode.Diagnostic(
          range,
          msg,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(d);
      }
    }
  }

  // Simple check for method call typos
  async _checkMethodCalls(doc, diagnostics, lines, firstRow, methodNames) {
    if (this.magikVSCode.classNames.length === 0) return;

    const end = lines.length - 1;
    const ignorePrevChars = ['(', ' ', '\t'];

    for (let i = 1; i < end; i++) {
      const row = firstRow + i;
      const line = lines[i];
      const testString = line.split('#')[0];
      let match;

      while (match = VAR_TEST.exec(testString)) { // eslint-disable-line
        const name = match[0];
        const index = match.index;

        if (
          Number.isNaN(Number(name)) &&
          testString[index - 1] === '.' &&
          !ignorePrevChars.includes(testString[index - 2])
        ) {
          let error = methodNames[name];
          if (error === undefined) {
            const symbols = await this.magikVSCode.provideWorkspaceSymbols(`^${name}`); // eslint-disable-line
            error = symbols.length === 0;
            methodNames[name] = error;
          }

          if (error) {
            const range = new vscode.Range(
              row,
              index,
              row,
              index + name.length
            );
            const d = new vscode.Diagnostic(
              range,
              `Method '${name}' is not defined.`,
              vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(d);
          }
        }
      }
    }
  }

  _checkPublicComment(doc, diagnostics, lines, firstRow) {
    if (firstRow === 0) return;

    const prevLine = doc.lineAt(firstRow - 1).text;
    if (
      !prevLine.includes('_pragma(') ||
      !prevLine.includes('classify_level=basic')
    )
      return;

    const firstLine = lines[0];

    if (
      firstLine.trim().startsWith('_private ') ||
      firstLine.includes(' _private ')
    ) {
      const errorIndex = firstLine.indexOf('_private');
      const range = new vscode.Range(
        firstRow,
        errorIndex,
        firstRow,
        errorIndex + 8
      );
      const d = new vscode.Diagnostic(
        range,
        'Private method should not be classified "basic".',
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(d);
      return;
    }

    const end = lines.length;
    let noComment = true;

    for (let i = 0; i < end; i++) {
      const line = lines[i];
      if (line.trim().startsWith('##')) {
        noComment = false;
        break;
      }
    }

    if (noComment) {
      const names = magikUtils.getClassAndMethodName(firstLine);
      const errorString = names.methodName ? names.methodName : firstLine;
      const errorIndex = firstLine.indexOf(errorString);
      const range = new vscode.Range(
        firstRow,
        errorIndex,
        firstRow,
        errorIndex + errorString.length
      );
      const d = new vscode.Diagnostic(
        range,
        'Public method should have a comment.',
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(d);
    }
  }

  _checkMethodLength(diagnostics, lines, firstRow) {
    const end = lines.length - 1;
    let count = 0;

    for (let i = 1; i < end; i++) {
      const line = lines[i];
      const testString = line.trim();
      if (testString.length > 0 && testString[0] !== '#') {
        count++;
      }
    }

    if (count > 30) {
      const firstLine = lines[0];
      const names = magikUtils.getClassAndMethodName(firstLine);
      const errorString = names.methodName ? names.methodName : firstLine;
      const errorIndex = firstLine.indexOf(errorString);
      const range = new vscode.Range(
        firstRow,
        errorIndex,
        firstRow,
        errorIndex + errorString.length
      );
      const d = new vscode.Diagnostic(
        range,
        'Long method. Consider refactoring this method.',
        vscode.DiagnosticSeverity.Hint
      );
      diagnostics.push(d);
    }
  }

  _checkMethodComplexity(diagnostics, lines, firstRow) {
    // Rough calculation of complexity
    const end = lines.length - 1;
    const decisionPoints = [
      /_if\s+/g,
      /_elif\s+/g,
      /\s+_andif/g,
      /\s+_orif/g,
      /(\s+|^)_loop(\s+|$)/g,
      /\s+_and(\s+|$)/g,
      /\s+_or(\s+|$)/g,
      /\s+_xor/g,
    ];
    const decisionPointsLength = decisionPoints.length;
    let decisionCount = 0;
    let returnCount = 0;
    let lastString = '';

    // TODO fix counting '>>'

    for (let i = 1; i < end; i++) {
      const line = lines[i];
      const testString = line.trim();
      const lineIndent = line.match(/^\t*/)[0].length;

      for (let index = 0; index < decisionPointsLength; index++) {
        decisionCount += (testString.match(decisionPoints[index]) || []).length;
      }

      returnCount += (testString.match(/\s*_return/g) || []).length;

      if (lineIndent === 1) {
        lastString = testString;
        if (/^>>/.test(testString)) {
          returnCount++;
        }
      }
    }

    if (!/^(_return|>>)/.test(lastString)) {
      returnCount++;
    }

    // const lineIndentsLength = lineIndents.length;
    // for (let i = lineIndentsLength - 1; i > -1; i--) {
    //   if (lineIndents[i] === 1) {
    //     const line = lines[i];
    //     const testString = line.trim();
    //     if (!/(^_return|^>>)/.test(testString)) {
    //       returnCount++;
    //     }
    //     break;
    //   }
    // }

    if (decisionCount - returnCount + 2 > 10) {
      const firstLine = lines[0];
      const names = magikUtils.getClassAndMethodName(firstLine);
      const errorString = names.methodName ? names.methodName : firstLine;
      const errorIndex = firstLine.indexOf(errorString);
      const range = new vscode.Range(
        firstRow,
        errorIndex,
        firstRow,
        errorIndex + errorString.length
      );
      const d = new vscode.Diagnostic(
        range,
        'Complex method. Consider refactoring this method.',
        vscode.DiagnosticSeverity.Warning
      );
      diagnostics.push(d);
    }
  }

  async _checkMagik(doc) {
    await this.magikVSCode.loadSymbols();

    const diagnostics = [];
    const methodNames = {};
    const symbols = this.magikVSCode.provideDocumentSymbols(doc);
    const symbolsLength = symbols.length;

    for (let i = 0; i < symbolsLength; i++) {
      const sym = symbols[i];

      if (sym.kind === vscode.SymbolKind.Method) {
        const startLine = sym.location.range.start.line;
        const region = magikUtils.currentRegion(true, startLine);
        const {lines} = region;

        if (lines) {
          const {firstRow} = region;
          // TODO - too slow
          // eslint-disable-next-line
          // const lineIndents = await this._getLineIndents(lines, firstRow);

          const assignedVars = this._checkVariables(
            doc,
            diagnostics,
            lines,
            firstRow
          );
          this._checkUnusedVariables(assignedVars, diagnostics);
          this._checkPublicComment(doc, diagnostics, lines, firstRow);
          // eslint-disable-next-line
          await this._checkMethodCalls(
            doc,
            diagnostics,
            lines,
            firstRow,
            methodNames
          );
          this._checkMethodLength(diagnostics, lines, firstRow);
          this._checkMethodComplexity(diagnostics, lines, firstRow);
        }
      }
    }

    this.diagnosticCollection.set(doc.uri, diagnostics);
  }
}

module.exports = MagikLinter;
