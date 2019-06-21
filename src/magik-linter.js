'use strict';

const vscode = require('vscode'); // eslint-disable-line
const magikUtils = require('./magik-utils');

const METHOD_IGNORE_PREV_CHARS = [' ', '\t', ',', '(', '[', '{'];
const METHOD_IGNORE_WORDS = ['0e', 'exemplar'];

const STATEMENT_PAIRS = [
  [
    '_if',
    '_endif',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_if\s*/,
    /(;|\s+)_endif/,
  ],
  [
    '_for',
    '_endloop',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_for\s*/,
    /(;|\s+)_endloop/,
  ],
  [
    '_proc',
    '_endproc',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_proc\s*[@a-zA-Z0-9_?!]*\s*\(.*/,
    /(;|\s+)_endproc/,
  ],
  [
    '_try',
    '_endtry',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_try\s*/,
    /(;|\s+)_endtry/,
  ],
  [
    '_while',
    '_endloop',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_while\s*/,
    /(;|\s+)_endloop/,
  ],
  [
    '_loop',
    '_endloop',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_loop\s*/,
    /(;|\s+)_endloop/,
  ],
  [
    '_catch',
    '_endcatch',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_catch\s*/,
    /(;|\s+)_endcatch/,
  ],
  [
    '_block',
    '_endblock',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_block\s*/,
    /(;|\s+)_endblock/,
  ],
  [
    '_lock',
    '_endlock',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_lock\s*/,
    /(;|\s+)_endlock/,
  ],
  [
    '_over',
    '_endloop',
    /([a-zA-Z0-9_?!]+\s*\)?\s*<<|\s+>>|^>>)\s*_over\s*/,
    /(;|\s+)_endloop/,
  ],
];

const INDENT_INC_STATEMENT_WORDS = [
  '_proc',
  '_try',
  '_catch',
  '_block',
  '_lock',
];

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
      vscode.commands.registerCommand('magik.formatRegion', () =>
        this._formatRegion()
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('magik.formatFile', () =>
        this._formatFile()
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
        '\n',
        ','
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
        keywords = magikUtils.MAGIK_OBJECT_KEYWORDS;
        break;
      case ',':
        keywords = magikUtils.MAGIK_VARIABLE_KEYWORDS;
        break;
      case '(':
        keywords = ['super', 'proc', 'loopbody'];
        break;
      default:
        // space, return and empty string
        keywords = magikUtils.MAGIK_KEYWORDS;
    }
    const keywordsLength = keywords.length;
    const separators = ['.', '(', ','];

    for (let index = 0; index < keywordsLength; index++) {
      const keyword = keywords[index];
      const length = keyword.length;

      if (length <= textLength) {
        let last = text.slice(-length - 1).trim();

        if (separators.includes(ch)) {
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
    return !testString.includes('"') && /(^|\s+)_method\s+/.test(testString);
  }

  _statementAssignTest(testString) {
    for (const [start, end, startReg, endReg] of STATEMENT_PAIRS) {
      if (!endReg.test(testString)) {
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

      if (testString[0] !== '#') {
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
        }

        if (tempIndent) {
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
            if (INDENT_INC_STATEMENT_WORDS.includes(statementAssignKeyword)) {
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

  async _addSpaceAfterComma(firstRow, lastRow) {
    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;

    for (let row = firstRow; row < lastRow + 1; row++) {
      const lineText = doc.lineAt(row).text;
      const lastIndex = lineText.length - 1;
      let text = lineText.split('#')[0];
      const reg = /,/g;
      let match;

      while (match = reg.exec(text)) { // eslint-disable-line
        const index = match.index;

        if (
          index !== lastIndex &&
          text[index + 1] !== ' ' &&
          text[index - 1] !== '%' &&
          !magikUtils.withinString(text, index)
        ) {
          const edit = new vscode.WorkspaceEdit();
          const insertPos = new vscode.Position(row, index + 1);
          edit.insert(doc.uri, insertPos, ' ');
          await vscode.workspace.applyEdit(edit); // eslint-disable-line
          text = `${text.substring(0, index + 1)} ${text.substring(index + 1)}`;
        }
      }
    }
  }

  async _removeSpacesBetweenBrackets(firstRow, lastRow) {
    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;

    for (let row = firstRow; row < lastRow + 1; row++) {
      let text = doc.lineAt(row).text.split('#')[0];
      let reg = /[([{]/g;
      let match;

      while (match = reg.exec(text)) { // eslint-disable-line
        const index = match.index;

        if (
          text[index + 1] === ' ' &&
          text[index - 1] !== '%' &&
          !magikUtils.withinString(text, index)
        ) {
          const edit = new vscode.WorkspaceEdit();
          const range = new vscode.Range(row, index + 1, row, index + 2);
          edit.replace(doc.uri, range, '');
          await vscode.workspace.applyEdit(edit); // eslint-disable-line
          text = text.substring(0, index + 1) + text.substring(index + 2);
        }
      }

      reg = /[)\]}]/g;

      while (match = reg.exec(text)) { // eslint-disable-line
        const index = match.index;

        if (text[index - 1] === ' ' && !magikUtils.withinString(text, index)) {
          const edit = new vscode.WorkspaceEdit();
          const range = new vscode.Range(row, index - 1, row, index);
          edit.replace(doc.uri, range, '');
          await vscode.workspace.applyEdit(edit); // eslint-disable-line
          text = text.substring(0, index - 1) + text.substring(index);
        }
      }
    }
  }

  async _indentRegion(currentRow) {
    const {lines, firstRow} = magikUtils.currentRegion();
    if (lines) {
      await this._indentMagikLines(lines, firstRow, currentRow);
    }
  }

  async _formatRegion() {
    const {lines, firstRow} = magikUtils.currentRegion();
    if (lines) {
      const lastRow = firstRow + lines.length - 1;
      await this._indentMagikLines(lines, firstRow);
      await this._removeSpacesBetweenBrackets(firstRow, lastRow);
      await this._addSpaceAfterComma(firstRow, lastRow);
    }
  }

  _docLines() {
    const lines = [];
    const editor = vscode.window.activeTextEditor;
    if (!editor) return lines;

    const doc = editor.document;
    const linesLength = doc.lineCount;
    for (let i = 0; i < linesLength; i++) {
      lines.push(doc.lineAt(i).text);
    }

    return lines;
  }

  async _indentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const lines = this._docLines();
    await this._indentMagikLines(lines, 0);
  }

  async _formatFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const lines = this._docLines();
    const lastRow = lines.length - 1;

    await this._indentMagikLines(lines, 0);
    await this._removeSpacesBetweenBrackets(0, lastRow);
    await this._addSpaceAfterComma(0, lastRow);
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

  _checkVariables(lines, firstRow, diagnostics) {
    const assignedVars = magikUtils.getMethodParams(lines, firstRow);
    const end = lines.length - 1;
    let search = false;

    for (let i = 0; i < end; i++) {
      const row = firstRow + i;
      const line = lines[i];
      const text = line.split('#')[0];

      if (search) {
        this.magikVSCode.findAssignedVariables(line, row, assignedVars);
        this.magikVSCode.findLocalVariables(
          line,
          row,
          assignedVars,
          diagnostics
        );
      } else if (
        /(\)|<<|\])/.test(text) ||
        /(^|\s+)_method\s+.*[a-zA-Z0-9_?!]$/.test(text)
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
        let d;
        if (data.param) {
          d = new vscode.Diagnostic(
            range,
            `"${varName}" is never used.`,
            vscode.DiagnosticSeverity.Warning
          );
        } else {
          d = new vscode.Diagnostic(
            range,
            `"${varName}" is defined but never used.`,
            vscode.DiagnosticSeverity.Error
          );
        }
        diagnostics.push(d);
      }
    }
  }

  _checkClassNameVariables(assignedVars, diagnostics) {
    if (this.magikVSCode.classNames.length === 0) return;

    for (const [varName, data] of Object.entries(assignedVars)) {
      if (!data.global && this.magikVSCode.classData[varName]) {
        const range = new vscode.Range(
          data.row,
          data.index,
          data.row,
          data.index + varName.length
        );
        const msg = data.param
          ? `Class name "${varName}" is used as a parameter.`
          : `Class name "${varName}" is used as a local variable.`;
        const d = new vscode.Diagnostic(
          range,
          msg,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(d);
      }
    }
  }

  async _methodExists(methodName, className, inherit) {
    const query = className
      ? `^${className}$.^${methodName}$`
      : `^${methodName}$`;
    this.magikVSCode.resolveSymbols = false;
    const symbols = await this.magikVSCode.provideWorkspaceSymbols(
      query,
      inherit
    );
    this.magikVSCode.resolveSymbols = true;
    return symbols.length > 0;
  }

  // Simple check for method call typos
  async _checkMethodCalls(
    lines,
    firstRow,
    assignedVars,
    methodNames,
    diagnostics
  ) {
    if (this.magikVSCode.classNames.length === 0) return;

    const names = magikUtils.getClassAndMethodName(lines[0]);
    const currentClassName = names ? names.className : undefined;
    const lineLength = lines.length - 1;

    for (let i = 1; i < lineLength; i++) {
      const row = firstRow + i;
      const line = lines[i];
      const text = line.split('#')[0];
      const testString = magikUtils.removeStrings(text);
      let startIndex = 0;
      let match;

      while (match = magikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
        const name = match[0];
        let index = match.index;

        if (
          Number.isNaN(Number(name)) &&
          testString[index - 1] === '.' &&
          !METHOD_IGNORE_PREV_CHARS.includes(testString[index - 2]) &&
          !METHOD_IGNORE_WORDS.includes(name)
        ) {
          const methodName = magikUtils.getMethodName(testString, name, index);
          let className;
          let inherit;

          index = text.indexOf(name, startIndex);

          const prevWord = magikUtils.previousVarInString(text, index);
          if (prevWord === '_self' || prevWord === '_clone') {
            className = currentClassName;
          } else if (prevWord === '_super') {
            className = currentClassName;
            inherit = true;
          } else if (this.magikVSCode.classData[prevWord]) {
            className = prevWord;
          } else {
            const superMatch = /_super\s*\(\s*[a-zA-Z0-9_?!]+\s*\)\s*\.\s*[a-zA-Z0-9_?!]*$/.exec(
              text.substring(0, index)
            );
            if (superMatch) {
              className = superMatch[0]
                .split('(')[1]
                .split(')')[0]
                .trim();
            } else {
              const prevData = assignedVars[prevWord];
              if (prevData) {
                className = prevData.className;
              }
            }
          }

          const key = `${className}.${methodName}`;
          let exists = methodNames[key];
          if (exists === undefined) {
            exists = await this._methodExists(methodName, className, inherit); // eslint-disable-line
            methodNames[key] = exists;
          }

          if (!exists) {
            const range = new vscode.Range(
              row,
              index,
              row,
              index + name.length
            );
            const msg = className
              ? `Method '${className}.${methodName}' is not defined.`
              : `Method '${methodName}' is not defined.`;
            const d = new vscode.Diagnostic(
              range,
              msg,
              vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(d);
          }
        }

        startIndex = index + name.length;
      }
    }
  }

  _checkPublicComment(doc, lines, firstRow, diagnostics) {
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

  _checkMethodComplexity(lines, firstRow, diagnostics) {
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
        vscode.DiagnosticSeverity.Hint
      );
      diagnostics.push(d);
    }
  }

  _checkMethodLength(lines, firstRow, diagnostics) {
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

  // TODO - add annotation to ignore line

  async _checkMagik(doc) {
    if (!vscode.workspace.getConfiguration('magik-vscode').enableLinting)
      return;

    await this.magikVSCode.loadSymbols();

    const diagnostics = [];
    const methodNames = {};
    const symbols = this.magikVSCode.currentSymbols;
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
            lines,
            firstRow,
            diagnostics
          );
          this._checkUnusedVariables(assignedVars, diagnostics);
          this._checkClassNameVariables(assignedVars, diagnostics);
          this._checkPublicComment(doc, lines, firstRow, diagnostics);
          // eslint-disable-next-line
          await this._checkMethodCalls(
            lines,
            firstRow,
            assignedVars,
            methodNames,
            diagnostics
          );
          this._checkMethodComplexity(lines, firstRow, diagnostics);
          this._checkMethodLength(lines, firstRow, diagnostics);
        }
      }
    }

    this.diagnosticCollection.set(doc.uri, diagnostics);
  }
}

module.exports = MagikLinter;
