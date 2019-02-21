'use strict';

const vscode = require('vscode'); // eslint-disable-line
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const MAGIK_KEYWORDS = [
  'self',
  'return',
  'unset',
  'if',
  'then',
  'else',
  'elif',
  'endif',
  'true',
  'false',
  'maybe',
  'is',
  'isnt',
  'not',
  'and',
  'andif',
  'or',
  'orif',
  'xor',
  'for',
  'over',
  'loop',
  'endloop',
  'while',
  'finally',
  'loopbody',
  'leave',
  'continue',
  'try',
  'with',
  'when',
  'endtry',
  'throw',
  'catch',
  'handling',
  'protect',
  'protection',
  'endprotect',
  'method',
  'endmethod',
  'proc',
  'endproc',
  'block',
  'endblock',
  'super',
  'clone',
  'optional',
  'scatter',
  'gather',
  'allresults',
  'lock',
  'endlock',
  'abstract',
  'private',
  'local',
  'global',
  'iter',
  'import',
  'pragma',
  'default',
  'dynamic',
  'thisthread',
  'constant',
  'package',
];

const MAGIK_VARIABLE_KEYWORDS = ['self', 'super', 'clone', 'thisthread'];

const INVALID_CHAR = /[^a-zA-Z0-9_\\?\\!]/;

const incWords = [
  '_then',
  '_else',
  '_loop',
  '_try',
  '_when',
  '_protect',
  '_protection',
  '_block',
  '_proc',
  '_finally',
];
const incWordsLength = incWords.length;

const decWords = [
  '_else',
  '_elif',
  '_endif',
  '_endloop',
  '_when',
  '_endtry',
  '_protection',
  '_endprotect',
  '_endmethod',
  '_endblock',
  '_endproc',
  '_finally',
];
const decWordsLength = decWords.length;

const endWords = [
  '.',
  '+',
  '-',
  '*',
  '/',
  '_andif',
  '_and',
  '_orif',
  '_or',
  '_xor',
];
const endWordsLength = endWords.length;

const startAssignWords = [
  '_if',
  '_for',
  '_try',
  '_protect',
  '_over',
  '_loop',
  '_while',
  '_proc',
];
const endAssignWords = [
  '_endif',
  '_endloop',
  '_endtry',
  '_endprotect',
  '_endproc',
];

const definitionTests = [
  {
    test: new RegExp(`(^_method | _method ).+\\.\\s*.+`),
    type: vscode.SymbolKind.Method,
  },
  {
    test: new RegExp(`\\.\\s*(define_shared_constant)\\s*\\(\\s*:.+`),
    type: vscode.SymbolKind.Constant,
  },
  {
    test: new RegExp(
      `\\.\\s*(define_slot_access|define_shared_variable)\\s*\\(\\s*:.+`
    ),
    type: vscode.SymbolKind.Variable,
  },
  {
    test: new RegExp(`\\.\\s*(def_property|define_property)\\s*\\(\\s*:.+`),
    type: vscode.SymbolKind.Property,
  },
  {
    test: new RegExp(`(^def_slotted_exemplar)\\s*\\(\\s*:.+`),
    type: vscode.SymbolKind.Class,
  },
];

let classData = {};
const openFiles = [];
let diagnostics;

function currentWord(doc, pos) {
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
  start = revText.search(INVALID_CHAR);
  if (start === -1) return;

  start = col - start;

  end = text.slice(col).search(INVALID_CHAR);
  if (end === -1) {
    end = text.length;
  } else {
    end = col + end;
  }

  if (start !== end) {
    return text.slice(start, end).trim();
  }
}

function previousWord(doc, pos, varOnly) {
  const line = doc.lineAt(pos.line);
  let text = line.text.slice(0, pos.character);
  let index;

  text = text
    .split('')
    .reverse()
    .join('')
    .trim();

  index = text.search(INVALID_CHAR);
  if (index === -1) {
    // Try previous row - ignore comments
    for (let row = pos.line - 1; row > -1; row--) {
      let newText = doc.lineAt(row).text;
      if (newText.trim()[0] !== '#') {
        newText = newText
          .split('')
          .reverse()
          .join('')
          .trim();
        index = newText.search(INVALID_CHAR);
        text = newText;
        break;
      }
    }
  }
  if (index === -1) return;

  text = text.slice(index).trim();
  if (varOnly) {
    if (text[0] !== '.') return;
    text = text.slice(1).trim();
  } else {
    index = text.search(/[a-zA-Z0-9_\\?\\!]/);
    if (index === -1) return;
    text = text.slice(index);
  }

  index = text.search(INVALID_CHAR);
  if (index === -1) index = text.length;

  text = text.slice(0, index);
  return text
    .split('')
    .reverse()
    .join('');
}

function nextWord(doc, pos) {
  const line = doc.lineAt(pos.line);
  let text = line.text.slice(pos.character);
  let index = text.search(INVALID_CHAR);
  if (index === -1) return;

  text = text.slice(index);
  index = text.search(/[a-zA-Z0-9_\\?\\!]/);
  if (index === -1) {
    // Try next row - ignore comments
    for (let row = pos.line + 1; row < doc.lineCount; row++) {
      const newText = doc.lineAt(row).text.trim();
      if (newText[0] !== '#') {
        index = newText.search(/[a-zA-Z0-9_\\?\\!]/);
        text = newText;
        break;
      }
    }
  }
  if (index === -1) return;

  text = text.slice(index);
  index = text.search(INVALID_CHAR);
  if (index === -1) return;

  return text.slice(0, index);
}

function currentClassName(doc, pos) {
  for (let row = pos.line; row > -1; row--) {
    const text = doc.lineAt(row).text;
    const trim = text.trim();
    if (trim.startsWith('_method ') || text.includes(' _method ')) {
      const className = text
        .split('_method ')
        .splice(-1)[0]
        .split('.')[0];
      return className.trim();
    }
    if (trim.startsWith('def_slotted_exemplar')) {
      const col = text.indexOf('def_slotted_exemplar') + 20;
      const newPos = new vscode.Position(row, col);
      return nextWord(doc, newPos);
    }
  }
}

function removeStrings(text) {
  const textLength = text.length;
  const noStrings = [];
  let count = 0;

  for (let i = 0; i < textLength; i++) {
    const c = text[i];
    if (c === '"') {
      count++;
    } else if (!(count % 2)) {
      noStrings.push(c);
    }
  }

  return noStrings.join('');
}

function compileText(lines) {
  const tempFile = 'C:/Temp/vscode_temp.magik';
  const command = 'vs_load()\u000D';
  const output = lines.join('\r\n');

  fs.writeFileSync(tempFile, output);

  vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
    text: command,
  });
}

function compileFile() {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const {fileName} = doc;

  if (fileName.split('.').slice(-1)[0] === 'magik') {
    const command = `load_file("${fileName}")\u000D`;
    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
      text: command,
    });
  }
}

function compileSelection() {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const selection = editor.selection;

  if (!selection.empty) {
    const text = doc.getText(new vscode.Range(selection.start, selection.end));
    const lines = [
      '#% text_encoding = iso8859_1',
      '_package sw',
      '$',
      '# Output:Loading selection ...',
    ];
    lines.push(text);
    compileText(lines);
  }
}

function currentRegion(methodOnly, startRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;

  if (!startRow) {
    startRow = editor.selection.active.line;
  }

  const lines = [];
  const lineCount = doc.lineCount;
  let firstRow;
  let lastRow;

  if (!methodOnly) {
    firstRow = 0;
    lastRow = lineCount - 1;
  }

  for (let row = startRow; row > -1; row--) {
    const lineText = doc.lineAt(row).text;
    const lineTextTrimmed = lineText.trim();

    lines.unshift(lineText);

    if (
      lineTextTrimmed.startsWith('_method ') ||
      lineTextTrimmed.includes(' _method ')
    ) {
      firstRow = row;
      break;
    } else if (
      row < startRow - 1 &&
      (lineTextTrimmed.startsWith('_endmethod') || lineTextTrimmed === '$')
    ) {
      if (!methodOnly) {
        lines.shift();
        firstRow = row + 1;
      }
      break;
    }
  }

  for (let row = startRow; row < lineCount; row++) {
    const lineText = doc.lineAt(row).text;
    const lineTextTrimmed = lineText.trim();

    if (row !== startRow) {
      lines.push(lineText);
    }

    if (lineTextTrimmed.startsWith('_endmethod')) {
      lastRow = row;
      break;
    } else if (
      lineTextTrimmed.startsWith('_pragma') ||
      (row !== startRow &&
        (lineTextTrimmed.startsWith('_method ') ||
          lineTextTrimmed.includes(' _method '))) ||
      lineTextTrimmed === '$'
    ) {
      if (!methodOnly) {
        lines.pop();
        lastRow = row - 1;
      }
      break;
    }
  }

  if (firstRow !== undefined && lastRow !== undefined) {
    return {lines, firstRow, lastRow};
  }
  return {};
}

function compileMethod() {
  const lines = currentRegion(true).lines;
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
    let index = methodName.search(INVALID_CHAR);
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

  compileText(lines);
}

function cancelAssignIndent(testString) {
  for (let i = 0; i < endAssignWords.length; i++) {
    const endWord = endAssignWords[i];
    if (
      testString.startsWith(endWord) ||
      testString.endsWith(` ${endWord}`) ||
      testString.endsWith(`;${endWord}`)
    ) {
      return true;
    }
  }
  return false;
}

function methodStartTest(testString) {
  return testString.startsWith('_method ') || testString.includes(' _method ');
}

function procAssignTest(testString) {
  if (/(;|\s+)_endproc/.test(testString)) {
    return false;
  }
  return /[a-zA-Z0-9_?!]+\s*<<\s*_proc\s*[@a-zA-Z0-9_?!]*\s*\(.*/.test(
    testString
  );
}

function statementAssignTest(testString) {
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
        return true;
      }
    }
  }
}

function arrowAssignTest(testString) {
  return testString.slice(-2) === '<<';
}

async function indentMagik(currentRow) {
  const {lines, firstRow} = currentRegion();
  if (!lines) return;

  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;

  const incBrackets = /[({]/g;
  const decBrackets = /[)}]/g;
  let indent = 0;
  let tempIndent = false;
  let assignIndent = false;
  let indentRow;

  for (let row = 0; row < lines.length; row++) {
    const text = lines[row];
    const textLength = text.length;
    let testString = text.trim();
    let start = text.search(/\S/);
    let matches;

    if (start === -1) start = textLength;

    if (testString !== '#') {
      for (let i = 0; i < decWordsLength; i++) {
        if (testString.startsWith(decWords[i])) {
          indent--;
          break;
        }
      }
    }

    const indentText = indent === 0 ? '' : new Array(indent + 1).join('\t');

    if (indentText !== text.slice(0, start)) {
      if (!currentRow || firstRow + row === currentRow) {
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
    }

    if (firstRow + row === currentRow) return;

    if (testString[0] !== '#') {
      testString = testString.split('#')[0].trim();

      if (indentRow !== undefined) {
        if (row === indentRow + 1) {
          let found = false;
          for (let i = 0; i < startAssignWords.length; i++) {
            if (testString.startsWith(startAssignWords[i])) {
              found = true;
              break;
            }
          }
          if (!found) {
            indent--;
            indentRow = undefined;
          }
        }
        if (indentRow !== undefined && cancelAssignIndent(testString)) {
          indent--;
          indentRow = undefined;
        }
      } else if (assignIndent) {
        if (cancelAssignIndent(testString)) {
          indent--;
          assignIndent = false;
        }
      } else if (tempIndent) {
        indent--;
        tempIndent = false;
      }

      if (methodStartTest(testString)) {
        indent++;
      } else if (statementAssignTest(testString)) {
        indent++;
        assignIndent = true;
      } else if (procAssignTest(testString)) {
        indent += 2;
        assignIndent = true;
      } else {
        for (let i = 0; i < incWordsLength; i++) {
          const iWord = incWords[i];
          if (testString === iWord || testString.startsWith(`${iWord} `)) {
            indent++;
            break;
          }
        }
      }

      if (arrowAssignTest(testString)) {
        indent++;
        indentRow = row;
      } else {
        for (let i = 0; i < endWordsLength; i++) {
          if (testString.endsWith(endWords[i])) {
            indent++;
            tempIndent = true;
            break;
          }
        }
      }

      // Remove strings before counting brackets
      const noStrings = removeStrings(testString);

      matches = noStrings.match(incBrackets);
      if (matches) {
        indent += matches.length;
      }
      matches = noStrings.match(decBrackets);
      if (matches) {
        indent -= matches.length;
      }
    } else if (indentRow !== undefined) {
      indentRow++;
    }
  }
}

async function addUnderscore(doc, pos, ch) {
  const line = doc.lineAt(pos.line);
  const lineText = line.text;
  const text = lineText.slice(0, pos.character);
  const textLength = text.length;

  // Don't update in a comment
  const noStrings = removeStrings(text);
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
      keywords = MAGIK_VARIABLE_KEYWORDS;
      break;
    case '(':
      keywords = ['proc', 'loopbody'];
      break;
    default:
      keywords = MAGIK_KEYWORDS;
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
            text[textLength - length - 1].search(INVALID_CHAR) === 0
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
          text[textLength - length - 2].search(INVALID_CHAR) === 0
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

async function formatMagik(doc, pos, ch) {
  if (ch === '\n') {
    if (
      vscode.workspace.getConfiguration('magik-vscode').enableAutoIndentation
    ) {
      const row = pos.line;
      const lastCol = doc.lineAt(row - 1).text.length;
      const lastPos = new vscode.Position(row - 1, lastCol);
      await addUnderscore(doc, lastPos, '');
      await indentMagik(row - 1);
      await indentMagik(row);
    }
  } else {
    const edit = await addUnderscore(doc, pos, ch);
    if (edit) {
      return [edit];
    }
  }
}

function getMagikFilesInDirectory(dir) {
  const magikFiles = [];
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    if (path.extname(file) === '.magik') {
      magikFiles.push(path.join(dir, file));
    }
  });
  return magikFiles;
}

// TODO - assumes definitions are on one line!
function findDefinition(fileName, word) {
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
function getMagikReferences(doc, pos) {
  const locs = [];
  const current = currentWord(doc, pos);
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

function getClassAndMethodName(text) {
  const parts = text.split('.');
  const className = parts[0]
    .split(' ')
    .splice(-1)[0]
    .trim();
  let methodName;

  if (parts.length > 1) {
    methodName = parts[1].trim();
    let index = methodName.search(INVALID_CHAR);
    if (index === -1) index = methodName.length;
    methodName = methodName.slice(0, index);
    return {className, methodName};
  }
}

function getDefinitionSymbol(doc, row, text, defTest) {
  let index = text.search(defTest.test);

  if (index === -1) return;

  let className;
  let methodName;

  if (defTest.type === vscode.SymbolKind.Method) {
    const res = getClassAndMethodName(text);
    if (res.methodName) {
      className = res.className;
      methodName = res.methodName;
    }
  } else {
    const pos = new vscode.Position(row, index + 1);
    const next = nextWord(doc, pos);
    if (next) {
      className = currentClassName(doc, pos);
      methodName = next;
    }
  }

  if (className) {
    index = text.indexOf(methodName);
    const range = new vscode.Range(row, index, row, index + methodName.length);
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

function gotoPreviousDefinition() {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const startRow = editor.selection.active.line - 1;
  const testsLength = definitionTests.length;

  for (let row = startRow; row > 0; row--) {
    const text = doc.lineAt(row).text;

    for (let i = 0; i < testsLength; i++) {
      const defTest = definitionTests[i];
      const sym = getDefinitionSymbol(doc, row, text, defTest);
      if (sym) {
        const range = sym.location.range;
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range); // , vscode.TextEditorRevealType.InCenter);
        return;
      }
    }
  }
}

function gotoNextDefinition() {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const startRow = editor.selection.active.line + 1;
  const lineCount = doc.lineCount;
  const testsLength = definitionTests.length;

  for (let row = startRow; row < lineCount; row++) {
    const text = doc.lineAt(row).text;

    for (let i = 0; i < testsLength; i++) {
      const defTest = definitionTests[i];
      const sym = getDefinitionSymbol(doc, row, text, defTest);
      if (sym) {
        const range = sym.location.range;
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range); // , vscode.TextEditorRevealType.InCenter);
        return;
      }
    }
  }
}

// TODO - currently only looking for definitions on one line
function getDocSymbols(doc) {
  const symbols = [];
  const testsLength = definitionTests.length;

  const lineCount = doc.lineCount;

  for (let row = 0; row < lineCount; row++) {
    const text = doc.lineAt(row).text;

    for (let i = 0; i < testsLength; i++) {
      const defTest = definitionTests[i];
      const sym = getDefinitionSymbol(doc, row, text, defTest);
      if (sym) {
        symbols.push(sym);
        break;
      }
    }
  }

  return symbols;
}

async function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function loadSymbols() {
  const symbolFile = 'C:/Temp/vscode_symbols.txt';
  if (!fs.existsSync(symbolFile)) return;

  const input = fs.createReadStream(symbolFile);
  const rl = readline.createInterface({input});

  classData = {};

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

    classData[className] = {
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
      fs.unlinkSync(symbolFile);
      return;
    }
    await wait(75); //eslint-disable-line
  }
}

function refreshSymbols() {
  const command = 'vs_save_symbols()\u000D';
  vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
    text: command,
  });
}

function matchString(string, query, matchType) {
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

function getMethodSymbol(name, fileName, methodData) {
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

function findMethods(
  className,
  methodString,
  symbols,
  doneMethods,
  checkParents,
  methodMatchType
) {
  const data = classData[className];
  const sourceFile = data.sourceFile;
  const methods = data.methods;
  const methodsLength = methods.length;
  const max = 500;

  for (let methodIndex = 0; methodIndex < methodsLength; methodIndex++) {
    const methodData = methods[methodIndex];
    const name = `${className}.${methodData.name}`;

    if (
      !doneMethods.includes(name) &&
      matchString(methodData.name, methodString, methodMatchType)
    ) {
      let fileName = methodData.sourceFile;
      if (!fileName) {
        fileName = sourceFile;
      }
      const sym = getMethodSymbol(name, fileName, methodData);

      symbols.push(sym);
      doneMethods.push(name);

      if (doneMethods.length === max) return;
    }
  }

  if (checkParents) {
    const parents = data.parents;
    const parentsLength = parents.length;

    for (let parentIndex = 0; parentIndex < parentsLength; parentIndex++) {
      findMethods(
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

function findSuperMethods(
  className,
  methodString,
  symbols,
  doneMethods,
  methodMatchType
) {
  const data = classData[className];
  const parents = data.parents;
  const parentsLength = parents.length;
  const max = 500;

  for (let parentIndex = 0; parentIndex < parentsLength; parentIndex++) {
    findMethods(
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
      findSuperMethods(
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

async function getWorkspaceSymbols(query, inherit) {
  await loadSymbols();

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
    if (classString[0] === '^' && classString[classString.length - 1] === '$') {
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

  const classNames = Object.keys(classData);
  const classLength = classNames.length;

  for (let classIndex = 0; classIndex < classLength; classIndex++) {
    const className = classNames[classIndex];

    if (!classString || matchString(className, classString, classMatchType)) {
      if (inherit) {
        findSuperMethods(
          className,
          methodString,
          symbols,
          doneMethods,
          methodMatchType
        );
      } else {
        findMethods(
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

function resolveSymbol(sym) {
  const index = sym._methodName.search(INVALID_CHAR);
  if (index !== -1) {
    sym._methodName = sym._methodName.slice(0, index);
  }
  const loc = findDefinition(sym._fileName, sym._methodName);
  if (loc) {
    sym.location = loc;
    return sym;
  }
}

async function getCurrentDefinitionSymbol(doc, pos) {
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
  start = revText.search(INVALID_CHAR);
  if (start === -1) return {};

  start = col - start;

  end = text.slice(col).search(INVALID_CHAR);
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

  const previousText = previousWord(doc, pos, true);
  let classText = previousText;
  let symbol;
  let inherit = false;

  if (previousText) {
    if (['_self', '_super', '_clone'].includes(previousText)) {
      const className = currentClassName(doc, pos);
      if (className) {
        classText = className;
        if (previousText === '_super') {
          inherit = true;
        }
      }
    }

    let query = `^${classText}$.^${currentText}$`;
    let symbols = await getWorkspaceSymbols(query, inherit);

    if (symbols.length !== 1) {
      query = `^${currentText}$`;
      symbols = await getWorkspaceSymbols(query);
    }

    if (symbols.length === 1) {
      const resSymbol = resolveSymbol(symbols[0]);
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

async function goto() {
  let editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const pos = editor.selection.active;

  const {
    symbol,
    classText,
    currentText,
    previousText,
  } = await getCurrentDefinitionSymbol(doc, pos);

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

async function getMagikDefinition(doc, pos) {
  const {symbol, previousText} = await getCurrentDefinitionSymbol(doc, pos);

  if (symbol) {
    return symbol.location;
  }

  if (!['_self', '_super', '_clone'].includes(previousText)) return;

  // Revert to checking some files...

  const current = currentWord(doc, pos);
  const currentFileName = doc.fileName;
  const currentDir = path.dirname(currentFileName);
  const doneFileNames = [];
  let loc;

  // Check current file
  loc = findDefinition(currentFileName, current);
  if (loc) return loc;
  doneFileNames.push(currentFileName);

  // Check other open files
  for (let i = 0; i < openFiles.length; i++) {
    const fileName = openFiles[i];

    if (
      !doneFileNames.includes(fileName) &&
      path.extname(fileName) === '.magik'
    ) {
      loc = findDefinition(fileName, current);
      if (loc) return loc;
      doneFileNames.push(fileName);
    }
  }

  // Check other magik files from the directory
  const files = getMagikFilesInDirectory(currentDir);

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];

    if (!doneFileNames.includes(fileName)) {
      loc = findDefinition(fileName, current);
      if (loc) return loc;
      doneFileNames.push(fileName);
    }
  }
}

function getCompletionItems(doc, pos) {
  const current = currentWord(doc, pos);
  if (!current) return;

  const items = [];
  const length = MAGIK_KEYWORDS.length;

  for (let i = 0; i < length; i++) {
    const key = MAGIK_KEYWORDS[i];
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

function findUnassignedVariables(lines) {
  // TODO
}

function findErrors(doc) {
  // const symbols = getDocSymbols(doc);
  // const symbolsLength = symbols.length;
  // for (let i = 0; i < symbolsLength; i++) {
  //   const sym = symbols[i];
  //   if (sym.kind === vscode.SymbolKind.Method) {
  //     const startLine = sym.location.range.start.line;
  //     const lines = currentRegion(true, startLine).lines;
  //     if (lines) {
  //       findUnassignedVariables(lines);
  //     }
  //   }
  // }
}

function activate(context) {
  const magikFile = {
    scheme: 'file',
    language: 'magik',
  };
  const config = [
    ['goto', goto],
    ['compileMethod', compileMethod],
    ['compileFile', compileFile],
    ['compileSelection', compileSelection],
    ['indentMethod', indentMagik],
    ['refreshSymbols', refreshSymbols],
    ['gotoPreviousDefinition', gotoPreviousDefinition],
    ['gotoNextDefinition', gotoNextDefinition],
  ];

  for (const [name, func] of config) {
    const disposable = vscode.commands.registerCommand(`magik.${name}`, func);
    context.subscriptions.push(disposable);
  }

  context.subscriptions.push(
    vscode.languages.registerOnTypeFormattingEditProvider(
      magikFile,
      {
        provideOnTypeFormattingEdits: formatMagik,
      },
      ' ',
      '.',
      '(',
      '\n'
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(magikFile, {
      provideDefinition: getMagikDefinition,
    })
  );

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(magikFile, {
      provideReferences: getMagikReferences,
    })
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(magikFile, {
      provideDocumentSymbols: getDocSymbols,
    })
  );

  context.subscriptions.push(
    vscode.languages.registerWorkspaceSymbolProvider({
      provideWorkspaceSymbols: getWorkspaceSymbols,
      resolveWorkspaceSymbol: resolveSymbol,
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(magikFile, {
      provideCompletionItems: getCompletionItems,
    })
  );

  diagnostics = vscode.languages.createDiagnosticCollection('magik');

  vscode.workspace.onDidSaveTextDocument((doc) => {
    findErrors(doc);
  });

  // No api for open editors
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        const fileName = editor.document.fileName;
        const index = openFiles.indexOf(fileName);
        if (index === -1) {
          openFiles.push(fileName);
        } else {
          openFiles.splice(index, 1);
        }
      }
    })
  );
}

exports.activate = activate;
