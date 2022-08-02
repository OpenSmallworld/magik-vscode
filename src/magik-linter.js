'use strict';

const vscode = require('vscode'); // eslint-disable-line
const MagikUtils = require('./utils/magik-utils');
const MagikFormat = require('./magik-format');
const MagikVar = require('./magik-variables');
const MagikFiles = require('./utils/magik-files');

const METHOD_IGNORE_PREV_CHARS = [' ', '\t', ',', '(', '[', '{'];
const METHOD_IGNORE_WORDS = ['0e', 'exemplar'];

const STATEMENT_PAIRS = [
  ['_if', '_endif', /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_if\s*/, /(;|\s+)_endif/],
  [
    '_for',
    '_endloop',
    /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_for\s*/,
    /(;|\s+)_endloop/,
  ],
  [
    '_proc',
    '_endproc',
    /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_proc\s*[|@\w!?]*\s*\(.*/,
    /(;|\s+)_endproc/,
  ],
  [
    '_try',
    '_endtry',
    /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_try\s*/,
    /(;|\s+)_endtry/,
  ],
  [
    '_while',
    '_endloop',
    /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_while\s*/,
    /(;|\s+)_endloop/,
  ],
  [
    '_loop',
    '_endloop',
    /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_loop\s*/,
    /(;|\s+)_endloop/,
  ],
  [
    '_catch',
    '_endcatch',
    /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_catch\s*/,
    /(;|\s+)_endcatch/,
  ],
  [
    '_block',
    '_endblock',
    /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_block\s*/,
    /(;|\s+)_endblock/,
  ],
  [
    '_lock',
    '_endlock',
    /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_lock\s*/,
    /(;|\s+)_endlock/,
  ],
  [
    '_over',
    '_endloop',
    /([\w!?]+\s*\)?\s*<<|\s+>>|^>>)\s*_over\s*/,
    /(;|\s+)_endloop/,
  ],
];

const INDENT_PAIRS = {
  _method: '_endmethod',
  _then: '_endif',
  _else: '_endif',
  _loop: '_endloop',
  _try: '_when',
  _when: '_endtry',
  _protect: '_protection',
  _protection: '_endprotect',
  _catch: '_endcatch',
  _block: '_endblock',
  _proc: '_endproc',
  _finally: '_endloop',
  _lock: '_endlock',
};

const INDENT_INC_STATEMENT_WORDS = [
  '_proc',
  '_try',
  '_catch',
  '_block',
  '_lock',
];
const NO_CODE = /^\s*(#|$)/;
const START_PROC = /(?<=(^|[^\w!?]))_proc\s*[|@\w!?]*\s*\(/;
const DEC_STATEMENT = /(?<=\S(\s+|\s*;))(_endproc|_endif$)/;

class MagikLinter {
  constructor(magikVSCode, symbolProvider, context) {
    const magikFile = {
      scheme: 'file',
      language: 'magik',
    };

    this.magikVSCode = magikVSCode;
    this.symbolProvider = symbolProvider;

    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(
      'magik'
    );

    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      if (doc.languageId === 'magik') {
        try {
          await this._checkMagik(doc);
        } catch (error) {
          console.error(error);
        }
      }
    });

    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (doc.languageId === 'magik') {
        try {
          await this._checkMagik(doc);
        } catch (error) {
          console.error(error);
        }
      }
    });

    vscode.workspace.onDidCloseTextDocument((doc) => {
      this.diagnosticCollection.delete(doc.uri);
    });

    context.subscriptions.push(
      vscode.commands.registerCommand('magik.indentToLine', () =>
        this._indentToLine()
      )
    );

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
        ')',
        '\n',
        ',',
        '}'
      )
    );
  }

  async _addUnderscore(doc, pos, ch) {
    const line = doc.lineAt(pos.line);
    const lineText = line.text;
    const text = lineText.slice(0, pos.character);
    const textLength = text.length;

    // Don't update in a comment
    const noStrings = MagikUtils.removeStrings(text);
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
        keywords = MagikUtils.MAGIK_OBJECT_KEYWORDS;
        break;
      case ',':
        keywords = MagikUtils.MAGIK_VARIABLE_KEYWORDS;
        break;
      case '(':
        keywords = ['super', 'proc', 'loopbody'];
        break;
      case ')':
        keywords = MagikUtils.MAGIK_VARIABLE_KEYWORDS;
        break;
      default:
        // space, return and empty string
        keywords = MagikUtils.MAGIK_KEYWORDS;
    }
    const keywordsLength = keywords.length;
    const separators = ['.', '(', ',', ')'];

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
              text[textLength - length - 1].search(MagikUtils.INVALID_CHAR) ===
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
            text[textLength - length - 2].search(MagikUtils.INVALID_CHAR) === 0
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
    let cancelWords = MagikUtils.END_ASSIGN_WORDS;
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

  _incompleteInvocationTest(testString) {
    if (/<<$/.test(testString)) {
      return false;
    }
    if (/[({,]$/.test(testString)) {
      return true;
    }
    const endWordsLength = MagikUtils.END_WORDS.length;
    for (let i = 0; i < endWordsLength; i++) {
      if (testString.endsWith(MagikUtils.END_WORDS[i])) {
        return true;
      }
    }
    return false;
  }

  _startProcTest(testString) {
    const match = testString.match(START_PROC);
    return match && !MagikUtils.withinString(testString, match.index);
  }

  _endStatementTest(testString) {
    // Contains _endproc but not at start of line or _endif at end
    const match = testString.match(DEC_STATEMENT);
    return match && !MagikUtils.withinString(testString, match.index);
  }

  /*
   * Updates the indentation of the supplied array of lines.
   * Updates all lines if lastRow is not supplied.
   * Updates firstRow to lastRow if lastRow is supplied and updateRangeOnly is true.
   * Updates only lastRow if supplied.
   */
  async _indentMagikLines(
    lines,
    firstRow,
    lastRow,
    updateRangeOnly,
    checkOnly
  ) {
    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;

    const lineIndents = [];
    const assignIndentKeywords = [];
    const arrowAssignRows = [];
    const outdentWords = [];
    let indent = 0;
    let tempIndent = false;

    const edit = new vscode.WorkspaceEdit();

    for (let row = 0; row < lines.length; row++) {
      const text = lines[row];
      const textLength = text.length;
      let testString = text.trim();
      let start = text.search(/\S/);
      let matches;

      if (start === -1) start = textLength;

      // Don't reduce indent when chaining method calls when line starts with ').'
      if (testString[0] !== '#' && !/^\)\.\s*(#|$)/.test(testString)) {
        const decWordsLength = MagikUtils.INDENT_DEC_WORDS.length;
        for (let i = 0; i < decWordsLength; i++) {
          if (testString.startsWith(MagikUtils.INDENT_DEC_WORDS[i])) {
            indent--;
            break;
          }
        }
      }

      const indentText = '\t'.repeat(indent);

      lineIndents.push(indent);

      if (
        !checkOnly &&
        indentText !== text.slice(0, start) &&
        (!lastRow ||
          (!updateRangeOnly && firstRow + row === lastRow) ||
          (updateRangeOnly && firstRow + row <= lastRow))
      ) {
        const range = new vscode.Range(
          firstRow + row,
          0,
          firstRow + row,
          start
        );
        edit.replace(doc.uri, range, indentText);
      }


      if (firstRow + row === lastRow) break;

      if (NO_CODE.test(testString)) {
        if (arrowAssignRows.length > 0) {
          // Defer checking for a statement as the line is empty
          arrowAssignRows[arrowAssignRows.length - 1]++;
        }
      } else {
        testString = MagikUtils.stringBeforeComment(testString).trim();

        if (arrowAssignRows.length > 0) {
          if (row === arrowAssignRows.slice(-1)[0] + 1) {
            const startAssignWordsLength = MagikUtils.START_ASSIGN_WORDS.length;
            let assignIndentKeyword;
            for (let i = 0; i < startAssignWordsLength; i++) {
              if (testString.startsWith(MagikUtils.START_ASSIGN_WORDS[i])) {
                assignIndentKeyword = MagikUtils.START_ASSIGN_WORDS[i];
                assignIndentKeywords.push(assignIndentKeyword);
                break;
              }
            }
            if (!assignIndentKeyword) {
              if (this._incompleteInvocationTest(testString)) {
                // Defer checking for a statement as the line is incomplete
                arrowAssignRows[arrowAssignRows.length - 1]++;
              } else {
                indent--;
                arrowAssignRows.pop();
              }
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

        if (tempIndent && !/[,(]$/.test(testString)) {
          indent--;
          tempIndent = false;
        }

        if (/^\)\.$/.test(testString)) {
          // Don't increase indent when chaining method calls
        } else if (this._methodStartTest(testString)) {
          indent++;
          outdentWords[indent] = '_endmethod';
        } else {
          const statementAssignKeyword = this._statementAssignTest(testString);
          if (statementAssignKeyword) {
            indent++;
            assignIndentKeywords.push(statementAssignKeyword);
            if (INDENT_INC_STATEMENT_WORDS.includes(statementAssignKeyword)) {
              indent++;
            }
            outdentWords[indent] = INDENT_PAIRS[statementAssignKeyword];
          } else if (/^[)}]/.test(testString)) {
            // Starts with bracket - explicitly handled here as not included in INDENT_INC_WORDS test below
            indent++;
          } else if (/\s+_then(\s+|$)/.test(testString)) {
            indent++;
            if (/(\s+|;)_endif$/.test(testString)) {
              indent--;
            }
          } else {
            const incWordsLength = MagikUtils.INDENT_INC_WORDS.length;
            for (let i = 0; i < incWordsLength; i++) {
              const iWord = MagikUtils.INDENT_INC_WORDS[i];
              if (testString === iWord || testString.startsWith(`${iWord} `)) {
                indent++;
                outdentWords[indent] = INDENT_PAIRS[iWord];
                break;
              }
            }
            if (this._startProcTest(testString)) {
              indent++;
              outdentWords[indent] = '_endproc';
            }
            if (this._endStatementTest(testString)) {
              indent--;
            }
          }
        }

        if (this._arrowAssignTest(testString)) {
          indent++;
          arrowAssignRows.push(row);
        } else {
          const endWordsLength = MagikUtils.END_WORDS.length;
          for (let i = 0; i < endWordsLength; i++) {
            if (testString.endsWith(MagikUtils.END_WORDS[i])) {
              indent++;
              tempIndent = true;
              break;
            }
          }
        }

        // Remove strings before counting brackets
        const noStrings = MagikUtils.removeStrings(testString);

        matches = noStrings.match(MagikUtils.INC_BRACKETS);
        if (matches) {
          indent += matches.length;
        }
        matches = noStrings.match(MagikUtils.DEC_BRACKETS);
        if (matches) {
          indent -= matches.length;
        }
      }
    }

    if (edit.size > 0) {
      await vscode.workspace.applyEdit(edit);
    }

    this.magikVSCode.outdentWord = outdentWords[indent];

    return lineIndents;
  }

  // Update to current line
  async _indentToLine() {
    const editor = vscode.window.activeTextEditor;

    if (editor && editor.selection.active.line) {
      const pos = editor.selection.active;

      await this._addUnderscore(editor.document, pos, '');

      // Update current line and preceeding lines
      const {lines, firstRow} = MagikUtils.indentRegion();
      if (lines) {
        await this._indentMagikLines(lines, firstRow, pos.line, true);
      }
    }
  }

  async _indentRegion(lastRow) {
    const {lines, firstRow} = MagikUtils.indentRegion();
    if (lines) {
      await this._indentMagikLines(lines, firstRow, lastRow);
    }
  }

  async _formatRegion() {
    const {lines, firstRow} = MagikUtils.indentRegion();
    if (lines) {
      const lastRow = firstRow + lines.length - 1;
      await this._indentMagikLines(lines, firstRow);
      await MagikFormat.removeSpacesBetweenBrackets(firstRow, lastRow);
      await MagikFormat.removeSpacesAfterMethodName(firstRow, lastRow);
      await MagikFormat.addSpaceAfterComma(firstRow, lastRow);
      await MagikFormat.addSpacesAroundOperators(firstRow, lastRow);
      await MagikFormat.checkSymbolPipe(firstRow, lastRow);
    }
  }

  async _indentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const lines = MagikFiles.getDocLines(editor.document);
    await this._indentMagikLines(lines, 0);
  }

  async _formatFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const lines = MagikFiles.getDocLines(editor.document);
    const lastRow = lines.length - 1;

    await this._indentMagikLines(lines, 0);
    await MagikFormat.removeSpacesBetweenBrackets(0, lastRow);
    await MagikFormat.removeSpacesAfterMethodName(0, lastRow);
    await MagikFormat.addSpaceAfterComma(0, lastRow);
    await MagikFormat.addSpacesAroundOperators(0, lastRow);
    await MagikFormat.checkSymbolPipe(0, lastRow);
    await MagikFormat.addNewlineAfterDollar(0, lastRow);
  }

  // async _getLineIndents(lines, firstRow) {
  //   const lineIndents = await this._indentMagikLines(
  //     lines,
  //     firstRow,
  //     undefined,
  //     true
  //   );
  //   return lineIndents;
  // }

  async provideOnTypeFormattingEdits(doc, pos, ch) {
    try {
      if (ch === '\n') {
        await MagikFormat.wrapComment(pos.line - 1, ch);
        if (
          vscode.workspace.getConfiguration('magik-vscode')
            .enableAutoIndentation
        ) {
          const row = pos.line;
          const lastCol = doc.lineAt(row - 1).text.length;
          const lastPos = new vscode.Position(row - 1, lastCol);
          await this._addUnderscore(doc, lastPos, '');
          await this._indentRegion(row - 1);
          await this._indentRegion(row);
        }
      } else {
        if (ch === ' ') {
          await MagikFormat.wrapComment(pos.line, ch);
        }
        const edit = await this._addUnderscore(doc, pos, ch);
        if (edit) {
          return [edit];
        }
      }
    } catch (error) {
      console.error(error);
    }
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
    if (this.symbolProvider.classNames.length === 0) return;

    for (const [varName, data] of Object.entries(assignedVars)) {
      if (!data.global && this.symbolProvider.classData[varName]) {
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

  async _getMethodParamString(methodName, className, inherit) {
    this.magikVSCode.resolveSymbols = false;
    const symbols = await this.magikVSCode.provideWorkspaceSymbols(
      `^${className}$.^${methodName}$`,
      inherit
    );
    this.magikVSCode.resolveSymbols = true;

    if (symbols.length === 1) {
      const sym = symbols[0];
      this.magikVSCode.resolveSymbolCompletion(sym);
      const help = sym._help;
      if (help) {
        return help.signatures[0]._paramString;
      }
    }
  }

  // Simple check for method call typos
  async _checkMethodCalls(
    lines,
    firstRow,
    assignedVars,
    methodNames,
    diagnostics
  ) {
    if (this.symbolProvider.classNames.length === 0) return;

    const names = MagikUtils.getClassAndMethodName(lines[0]);
    const currentClassName = names.className;
    const lineLength = lines.length - 1;

    for (let i = 1; i < lineLength; i++) {
      const row = firstRow + i;
      const line = lines[i];
      const text = MagikUtils.stringBeforeComment(line);
      const testString = MagikUtils.removeStrings(text);
      let startIndex = 0;
      let match;

      while (match = MagikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
        const name = match[0];
        let index = match.index;

        if (
          Number.isNaN(Number(name)) &&
          testString[index - 1] === '.' &&
          !METHOD_IGNORE_PREV_CHARS.includes(testString[index - 2]) &&
          !METHOD_IGNORE_WORDS.includes(name)
        ) {
          const methodName = MagikUtils.getMethodName(testString, name, index);
          let className;
          let inherit;

          index = text.indexOf(name, startIndex);

          const prevWord = MagikUtils.previousVarInString(text, index);
          if (prevWord === '_self' || prevWord === '_clone') {
            className = currentClassName;
          } else if (prevWord === '_super') {
            className = currentClassName;
            inherit = true;
          } else if (this.symbolProvider.classData[prevWord]) {
            className = prevWord;
          } else {
            const superMatch = /_super\s*\(\s*([\w!?]+)\s*\)\s*\.\s*[\w!?]*$/.exec(
              text.substring(0, index)
            );
            if (superMatch) {
              className = superMatch[1];
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
          } else if (className && methodName.indexOf('(') !== -1) {
            const paramString = await this._getMethodParamString(methodName, className, inherit); // eslint-disable-line

            if (paramString && paramString !== '') {
              // console.log(methodName, className, `'${paramString}'`);
              const args = MagikUtils.findArgs(
                lines,
                firstRow,
                i,
                index + name.length + 1
              );
              // console.log(args);
              // console.log(' ');

              if (args && !args.some((str) => str.startsWith('_scatter '))) {
                let gatherIndex = paramString.indexOf('_gather');
                let optionalIndex = paramString.indexOf('_optional');
                const exactNumber = gatherIndex === -1 && optionalIndex === -1;
                const optionalNoGather =
                  optionalIndex !== -1 && gatherIndex === -1;

                if (gatherIndex === -1) {
                  gatherIndex = paramString.length;
                }
                if (optionalIndex === -1) {
                  optionalIndex = paramString.length;
                }

                const totalParams = paramString.split(',').length;
                const params = paramString
                  .substring(0, Math.min(gatherIndex, optionalIndex))
                  .split(',');
                const minString = params.slice(-1)[0].trim();
                if (minString === '' || minString === ',') {
                  params.pop();
                }
                const minParams = params.length;
                const actualParams = args.length;

                if (
                  actualParams < minParams ||
                  (exactNumber && actualParams !== minParams) ||
                  (optionalNoGather && actualParams > totalParams)
                ) {
                  const range = new vscode.Range(
                    row,
                    index,
                    row,
                    index + name.length
                  );
                  const msg =
                    actualParams > minParams
                      ? `Too many arguments for method '${className}.${methodName}'.`
                      : `Insufficient arguments for method '${className}.${methodName}'.`;
                  const d = new vscode.Diagnostic(
                    range,
                    msg,
                    vscode.DiagnosticSeverity.Error
                  );
                  diagnostics.push(d);
                }
              }
            }
          }
        }

        startIndex = index + name.length;
      }
    }
  }

  _checkPublicComment(doc, lines, firstRow, diagnostics) {
    if (firstRow === 0 || firstRow >= doc.lineCount) return;

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
      const names = MagikUtils.getClassAndMethodName(firstLine);
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
      const names = MagikUtils.getClassAndMethodName(firstLine);
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
      const names = MagikUtils.getClassAndMethodName(firstLine);
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

  // TODO - add annotation to ignore line for linting

  async _checkMagik(doc) {
    if (!vscode.workspace.getConfiguration('magik-vscode').enableLinting)
      return;

    await this.symbolProvider.loadSymbols();

    const diagnostics = [];
    const methodNames = {};
    const symbols = this.magikVSCode.currentSymbols;
    const symbolsLength = symbols.length;

    for (let i = 0; i < symbolsLength; i++) {
      const sym = symbols[i];

      if (sym.kind === vscode.SymbolKind.Method) {
        const startLine = sym.location.range.start.line;
        const region = MagikUtils.currentRegion(true, startLine);
        const {lines} = region;

        if (lines) {
          const {firstRow} = region;
          const assignedVars = MagikVar.getVariables(
            lines,
            firstRow,
            this.symbolProvider.classNames,
            this.symbolProvider.classData,
            this.symbolProvider.globalNames,
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
