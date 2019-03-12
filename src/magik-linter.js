'use strict';

const vscode = require('vscode'); // eslint-disable-line
const magikUtils = require('./magik-utils');

const VAR_IGNORE_PREV_CHARS = ['.', ':', '"', '%', '|', '@'];
const STATEMENT_PAIRS = [
  ['_if', '_endif'],
  ['_for', '_endloop'],
  [
    '_proc',
    '_endproc',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_proc\s*[@a-zA-Z0-9_?!]*\s*\(.*/,
  ],
  ['_try', '_endtry'],
  ['_while', '_endloop'],
  ['_catch', '_endcatch'],
  ['_loop', '_endloop'],
  ['_over', '_endloop'],
  ['_block', '_endblock'],
];
const DEFINE_KEYWORDS = ['_local ', '_dynamic ', ' _with ', '_global '];

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
      vscode.commands.registerCommand('magik.indentRegion', () =>
        this._indentRegion()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('magik.indentFile', () =>
        this._indentFile()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('magik.checkFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const doc = editor.document;
          await this._checkMagik(doc);
        }
      })
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
      for (const [start, end] of STATEMENT_PAIRS) {
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

  _statementAssignTest(testString) {
    for (const [start, end, reg] of STATEMENT_PAIRS) {
      const endReg = new RegExp(`(;|\\s+)${end}`);
      if (!endReg.test(testString)) {
        const startReg =
          reg ||
          new RegExp(
            `([a-zA-Z0-9_\\?\\!]+\\s*\\)?\\s*\\<<|\\s+>>|^>>)\\s*${start}\\s*`
          );
        if (startReg.test(testString)) {
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
    const assignIndentKeywords = [];
    const arrowAssignRows = [];
    let indent = 0;
    let tempIndent = false;

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

        if (arrowAssignRows.length > 0) {
          if (row === arrowAssignRows.slice(-1)[0] + 1) {
            const startAssignWordsLength = magikUtils.START_ASSIGN_WORDS.length;
            let assignIndentKeyword;
            for (let i = 0; i < startAssignWordsLength; i++) {
              if (testString.startsWith(magikUtils.START_ASSIGN_WORDS[i])) {
                assignIndentKeyword = magikUtils.START_ASSIGN_WORDS[i];
                assignIndentKeywords.push(assignIndentKeyword);
                break;
              }
            }
            if (!assignIndentKeyword) {
              indent--;
              arrowAssignRows.pop();
            }
          }
          if (
            arrowAssignRows.length > 0 &&
            this._cancelAssignIndent(
              testString,
              assignIndentKeywords.slice(-1)[0]
            )
          ) {
            indent--;
            arrowAssignRows.pop();
            assignIndentKeywords.pop();
          }
        } else if (assignIndentKeywords.length > 0) {
          if (
            this._cancelAssignIndent(
              testString,
              assignIndentKeywords.slice(-1)[0]
            )
          ) {
            indent--;
            assignIndentKeywords.pop();
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
            assignIndentKeywords.push(statementAssignKeyword);
            if (
              ['_proc', '_try', '_catch', '_block'].includes(
                statementAssignKeyword
              )
            ) {
              indent++;
            }
          } else if (/^_proc\s*[@a-zA-Z0-9_?!]*\s*\(/.test(testString)) {
            indent++;
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
          arrowAssignRows.push(row);
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
      } else if (arrowAssignRows.length > 0) {
        arrowAssignRows[arrowAssignRows.length - 1]++;
      }
    }

    return lineIndents;
  }

  async _indentRegion(currentRow) {
    const {lines, firstRow} = magikUtils.currentRegion();
    if (lines) {
      await this._indentMagikLines(lines, firstRow, currentRow);
    }
  }

  async _indentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const lines = [];
    const linesLength = doc.lineCount;
    for (let i = 0; i < linesLength; i++) {
      lines.push(doc.lineAt(i).text);
    }
    await this._indentMagikLines(lines, 0);
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
        await this._indentRegion(row - 1);
        await this._indentRegion(row);
      }
    } else {
      const edit = await this._addUnderscore(doc, pos, ch);
      if (edit) {
        return [edit];
      }
    }
  }

  // TODO - handle assigned across multiple lines
  _findAssignedVariables(text, row, assignedVars) {
    const assignSplit = text.split('<<');
    const assignSplitLength = assignSplit.length;
    if (assignSplitLength < 2) return;

    let match;

    for (let i = 0; i < assignSplitLength - 1; i++) {
      let testString = assignSplit[i].split('(').slice(-1)[0];
      let startIndex = text.indexOf(testString);
      testString = magikUtils.removeStrings(testString);
      const testStringLength = testString.length;

      while (match = magikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
        const varName = match[0];
        const varIndex = match.index;

        if (
          !assignedVars[varName] &&
          Number.isNaN(Number(varName)) &&
          testString[varIndex] !== '_' &&
          testString[varIndex + varName.length] !== '(' &&
          !VAR_IGNORE_PREV_CHARS.includes(testString[varIndex - 1])
        ) {
          const index = text.indexOf(varName, startIndex);
          startIndex = index;
          const dynamic = text.substring(index - 9, index) === '_dynamic ';

          assignedVars[varName] = {
            row,
            index,
            count: 1,
            dynamic,
          };
        }

        if (varIndex + varName.length === testStringLength) break;
      }
    }
  }

  _checkVariables(diagnostics, lines, firstRow) {
    const assignedVars = magikUtils.getMethodParams(lines, firstRow);
    const defLength = DEFINE_KEYWORDS.length;
    const showUndefined = this.magikVSCode.classNames.length > 0;
    const end = lines.length - 1;
    let search = false;

    for (let i = 1; i < end; i++) {
      const row = firstRow + i;
      const line = lines[i];
      const text = line.split('#')[0];
      let startIndex;
      let match;

      if (search) {
        const testString = magikUtils.removeStrings(text);
        const testStringLength = testString.length;

        this._findAssignedVariables(text, row, assignedVars);

        // TODO - loop scopes
        if (testString.includes('_for ') && testString.includes(' _over ')) {
          const overSplit = testString.split(' _over ');
          const iterTestString = overSplit[0].split('_for ').slice(-1)[0];
          const iterTestStringLength = iterTestString.length;
          startIndex = text.indexOf(iterTestString);

          while (match = magikUtils.VAR_TEST.exec(iterTestString)) { // eslint-disable-line
            const varName = match[0];
            const varIndex = text.indexOf(varName, startIndex);
            startIndex = varIndex;

            assignedVars[varName] = {
              row,
              index: varIndex,
              count: 1,
            };

            if (match.index + varName.length === iterTestStringLength) break;
          }
        }

        startIndex = 0;

        while (match = magikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
          const varName = match[0];
          const varLength = varName.length;
          let varIndex = match.index;

          if (
            Number.isNaN(Number(varName)) &&
            testString[varIndex] !== '_' &&
            testString[varIndex + varLength] !== '(' &&
            !VAR_IGNORE_PREV_CHARS.includes(testString[varIndex - 1])
          ) {
            const data = assignedVars[varName];
            varIndex = text.indexOf(varName, startIndex);

            if (
              showUndefined &&
              !data &&
              !this.magikVSCode.classData[varName] &&
              !this.magikVSCode.globals.includes(varName)
            ) {
              let def = false;

              for (let defIndex = 0; defIndex < defLength; defIndex++) {
                const defKeyword = DEFINE_KEYWORDS[defIndex];
                if (
                  text.substring(varIndex - defKeyword.length, varIndex) ===
                  defKeyword
                ) {
                  assignedVars[varName] = {
                    row,
                    index: varIndex,
                    count: 1,
                    dynamic: defKeyword === '_dynamic ',
                  };
                  def = true;
                }
              }

              if (!def) {
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

            if (data && (data.row !== row || data.index !== varIndex)) {
              data.count++;
            }
          }

          if (match.index + varLength === testStringLength) break;
          startIndex = varIndex + varLength;
        }
      } else if (
        /(\)|<<|\])/.test(text) ||
        /(^|\s+)_method\s+.*[a-zA-Z0-9_\\?\\!]$/.test(text)
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

  async _methodExists(name) {
    this.magikVSCode.resolveSymbols = false;
    const symbols = await this.magikVSCode.provideWorkspaceSymbols(`^${name}`);
    this.magikVSCode.resolveSymbols = true;
    return symbols.length > 0;
  }

  // Simple check for method call typos
  async _checkMethodCalls(doc, diagnostics, lines, firstRow, methodNames) {
    if (this.magikVSCode.classNames.length === 0) return;

    const end = lines.length - 1;
    const ignoreWords = ['0e'];
    const ignorePrevChars = [' ', '\t', '(', '{'];

    for (let i = 1; i < end; i++) {
      const row = firstRow + i;
      const line = lines[i];
      const testString = line.split('#')[0];
      let match;

      while (match = magikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
        const name = match[0];
        const index = match.index;

        if (
          Number.isNaN(Number(name)) &&
          testString[index - 1] === '.' &&
          !ignorePrevChars.includes(testString[index - 2]) &&
          !ignoreWords.includes(name)
        ) {
          let exists = methodNames[name];
          if (exists === undefined) {
            exists = this._methodExists(name);
            methodNames[name] = exists;
          }

          if (!exists) {
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

    // TODO - fix counting '>>'

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

    if (count > 40) {
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
          const assignedVars = this._checkVariables(
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
          this._checkMethodComplexity(diagnostics, lines, firstRow);
          this._checkMethodLength(diagnostics, lines, firstRow);
        }
      }
    }

    this.diagnosticCollection.set(doc.uri, diagnostics);
  }
}

module.exports = MagikLinter;
