'use strict';

const vscode = require('vscode'); // eslint-disable-line

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
  'endcatch',
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
  'div',
  'mod',
  'divmod',
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

const MAGIK_OBJECT_KEYWORDS = ['self', 'super', 'clone', 'thisthread'];
const MAGIK_VARIABLE_KEYWORDS = [
  'unset',
  'self',
  'true',
  'false',
  'maybe',
  'thisthread',
];

const INDENT_INC_WORDS = [
  '_then',
  '_else',
  '_loop',
  '_try',
  '_when',
  '_protect',
  '_protection',
  '_proc',
  '_catch',
  '_block',
  '_finally',
  '_lock',
];

const INDENT_DEC_WORDS = [
  '_else',
  '_elif',
  '_endif',
  '_endloop',
  '_when',
  '_endtry',
  '_protection',
  '_endprotect',
  '_endmethod',
  '_endproc',
  '_endcatch',
  '_endblock',
  '_finally',
  '_endlock',
  ')',
  '}',
];

const END_WORDS = [
  '.',
  '+',
  '-',
  '*',
  '/',
  '=',
  '>',
  '<',
  '_andif',
  '_and',
  '_orif',
  '_or',
  '_xor',
];

const START_ASSIGN_WORDS = [
  '_if',
  '_for',
  '_proc',
  '_try',
  '_while',
  '_loop',
  '_protect',
  '_catch',
  '_block',
  '_lock',
  '_over',
];
const END_ASSIGN_WORDS = [
  '_endif',
  '_endloop',
  '_endproc',
  '_endtry',
  '_endprotect',
  '_endcatch',
  '_endblock',
  '_endlock',
];

const VALID_CHAR = /[\w!?]/;
const INVALID_CHAR = /[^\w!?]/;
const VAR_TEST = /[\w!?]+/g;

const ASSIGN_IGNORE_NEXT = /^\s*(\(|\.|\)\.|(\s*,\s*[\w!?]+)+\s*$)/;
const VAR_IGNORE_PREV_CHARS = ['.', ':', '"', '%', '|', '@'];

const DEFINITION_TESTS = [
  {
    test: new RegExp(`(^|\\s+)_method\\s+.+\\.\\s*.+`),
    type: vscode.SymbolKind.Method,
  },
  {
    test: new RegExp(`\\.\\s*define_shared_constant\\s*\\(\\s*:.+`),
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
    test: new RegExp(`^def_slotted_exemplar\\s*\\(\\s*:.+`),
    type: vscode.SymbolKind.Class,
  },
];
const DEFINE_KEYWORD_TESTS = [
  /(_local|_with)\s+([\w!?]+\s*,\s*)*$/,
  /_global\s+([\w!?]+\s*,\s*)*$/,
  /_dynamic\s+([\w!?]+\s*,\s*)*$/,
];
const IMPORT_TEST = /_import\s+([\w!?]+\s*,\s*)*$/;

function previousWordInString(text, index) {
  const match = /([\w!?]+)[^\w!?]*[\w!?]*$/.exec(text.substring(0, index));
  if (match) {
    return match[1];
  }
}

function previousWord(doc, pos) {
  return previousWordInString(doc.lineAt(pos.line).text, pos.character);
}

function previousVarInString(text, index) {
  const match = /([\w!?]+)\s*\.\s*[\w!?]*$/.exec(text.substring(0, index));
  if (match && text[match.index - 1] !== '.') {
    return match[1];
  }
}

function currentWordInString(text, index) {
  const invalidIndex = text.slice(index).search(INVALID_CHAR);
  if (invalidIndex !== -1) {
    return previousWordInString(text, index + invalidIndex + 1);
  }

  const match = /[\w!?]+$/.exec(text);
  if (match) return match[0];
}

function currentWord(doc, pos) {
  return currentWordInString(doc.lineAt(pos.line).text, pos.character);
}

function nextWordInString(text, index) {
  const invalidIndex = text.slice(index).search(INVALID_CHAR);
  if (invalidIndex !== -1) {
    const match = /[\w!?]+/.exec(text.slice(index + invalidIndex));
    if (match) return match[0];
  }
}

function nextWord(doc, pos, searchNextLine) {
  const startRow = pos.line;
  let word = nextWordInString(doc.lineAt(startRow).text, pos.character);
  if (word || searchNextLine === false) return word;

  const endRow = doc.lineCount;

  for (let row = startRow + 1; row < endRow; row++) {
    const text = doc.lineAt(row).text;

    if (text.trim()[0] !== '#') {
      word = nextWordInString(text, 0);
      if (word) return word;
    }
  }
}

function currentClassName(doc, pos) {
  const methodReg = /(^|\s+)_method\s+([\w!?]+)\s*\./;
  const exemplarReg = /(^|\s*)def_slotted_exemplar\s*\(/;

  for (let row = pos.line; row > -1; row--) {
    const testString = doc.lineAt(row).text;
    const methodMatch = methodReg.exec(testString);

    if (methodMatch) {
      return methodMatch[2];
    }

    if (exemplarReg.test(testString)) {
      const col = testString.indexOf('def_slotted_exemplar') + 20;
      const newPos = new vscode.Position(row, col);
      return nextWord(doc, newPos);
    }
  }
}

function currentRegion(methodOnly, startLine) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};

  const doc = editor.document;
  const startMethodReg = /^\s*(_abstract\s+)*(_private\s+)*(_iter\s+)*_method\s+/;
  const endMethodReg = /^\s*_endmethod/;
  const previousReg = /^(\s*\$|\s*_endmethod|_endblock)/;
  const nextReg = /^(\s*\$|\s*_pragma|\s*(_abstract\s+)*(_private\s+)*(_iter\s+)*_method\s+|_block)/;
  const startReg = /^_block/;
  const endReg = /^_endblock/;

  if (!startLine) {
    startLine = editor.selection.active.line || 0;
    if (!startLine) startLine = 0;
  } else if (startLine < 0) {
    startLine = 0;
  }

  const lineCount = doc.lineCount;
  let firstRow;
  let lastRow;

  if (!methodOnly) {
    firstRow = 0;
    lastRow = lineCount - 1;
  }

  const startText = doc.lineAt(startLine).text;
  if (/^\s*_pragma/.test(startText)) {
    startLine = Math.min(startLine + 1, lineCount - 1);
  } else if (/^\s*\$/.test(startText)) {
    startLine = Math.max(startLine - 1, 0);
  }

  for (let row = startLine; row > -1; row--) {
    const lineText = doc.lineAt(row).text;

    if (methodOnly) {
      if (startMethodReg.test(lineText)) {
        firstRow = row;
        break;
      } else if (row < startLine && previousReg.test(lineText)) {
        break;
      }
    } else if (startReg.test(lineText)) {
      firstRow = row;
      break;
    } else if (row < startLine && previousReg.test(lineText)) {
      firstRow = row + 1;
      break;
    }
  }

  if (firstRow === undefined) return {};

  for (let row = startLine; row < lineCount; row++) {
    const lineText = doc.lineAt(row).text;

    if (methodOnly) {
      if (endMethodReg.test(lineText)) {
        lastRow = row;
        break;
      } else if (row > startLine && nextReg.test(lineText)) {
        break;
      }
    } else if (endReg.test(lineText)) {
      lastRow = row;
      break;
    } else if (row > startLine && nextReg.test(lineText)) {
      lastRow = row - 1;
      break;
    }
  }

  if (lastRow === undefined) return {};

  const lines = [];
  let found = false;

  for (let row = firstRow; row < lastRow + 1; row++) {
    const lineText = doc.lineAt(row).text;
    if (found) {
      lines.push(lineText);
    } else if (lineText[0] !== '$' && lineText.trim().length > 0) {
      found = true;
      firstRow = row;
      lines.push(lineText);
    }
  }

  for (let row = lines.length - 1; row > -1; row--) {
    const lineText = lines[row];
    if (lineText[0] === '$' || lineText.trim().length === 0) {
      lines.pop();
      lastRow--;
    } else {
      break;
    }
  }

  const linesLength = lines.length;
  if (linesLength === 0) return {};
  if (linesLength === 1 && lines[0].startsWith('_pragma')) return {};

  return {lines, firstRow, lastRow};
}

function indentRegion() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};

  const doc = editor.document;
  const previousReg = /^(\s*\$|\s*_endmethod|_endblock)/;
  const nextReg = /^(\s*\$|\s*_pragma|\s*(_abstract\s+)*(_private\s+)*(_iter\s+)*_method\s+|_block)/;

  let startLine = editor.selection.active.line;
  if (!startLine) startLine = 0;

  const lines = [];
  const lineCount = doc.lineCount;
  let firstRow = 0;
  let lastRow = lineCount - 1;

  for (let row = startLine; row > -1; row--) {
    const lineText = doc.lineAt(row).text;
    const lineTextTrimmed = lineText.trim();

    lines.unshift(lineText);

    if (row < startLine - 1 && previousReg.test(lineText)) {
      lines.shift();
      firstRow = row + 1;
      break;
    } else if (
      lineTextTrimmed.length > 0 &&
      lineText.match(/^\s*/)[0].length === 0
    ) {
      firstRow = row;
      break;
    }
  }

  for (let row = startLine + 1; row < lineCount; row++) {
    const lineText = doc.lineAt(row).text;

    if (nextReg.test(lineText)) {
      lastRow = row - 1;
      break;
    }

    lines.push(lineText);
  }

  return {lines, firstRow, lastRow};
}

function removeStrings(text) {
  const textLength = text.length;
  const noStrings = [];
  let count = 0;

  for (let i = 0; i < textLength; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== '%') {
      count++;
    } else if (!(count % 2)) {
      noStrings.push(c);
    }
  }

  return noStrings.join('');
}

function stringRanges(text) {
  const textLength = text.length;
  const ranges = [];
  let count = 0;
  let startIndex;

  for (let i = 0; i < textLength; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== '%') {
      if (startIndex === undefined) {
        startIndex = i;
      }
      count++;
    } else if (!(count % 2) && startIndex !== undefined) {
      ranges.push([startIndex, i - 1]);
      startIndex = undefined;
    }
  }

  if (startIndex !== undefined) {
    ranges.push([startIndex, textLength - 1]);
  }

  return ranges;
}

function withinString(text, index) {
  const ranges = stringRanges(text);
  const rangesLength = ranges.length;

  for (let i = 0; i < rangesLength; i++) {
    if (index > ranges[i][0] && index < ranges[i][1]) {
      return true;
    }
  }

  return false;
}

function stringBeforeComment(text) {
  let start = 0;
  let index = text.indexOf('#', start);

  while (index > -1) {
    if (withinString(text, index)) {
      start = index + 1;
      index = text.indexOf('#', start);
    } else {
      return text.substring(0, index);
    }
  }

  return text;
}

function getPackageName(doc) {
  const lineCount = doc.lineCount;

  for (let row = 0; row < lineCount; row++) {
    const text = doc.lineAt(row).text.trim();

    if (text.startsWith('_package ')) {
      return text.split(/\s/)[1];
    }
  }

  return 'sw';
}

function getClassAndMethodName(text) {
  const isMethod = text.match(
    /^\s*(_abstract)?\s*(_private)?\s*(_iter)?\s*_method\s+([\w!?]+)\s*\.\s*([\w!?]+)\s*(\(|<<|\[|^<<)?/
  );

  if (!isMethod) {
    return;
  }

  const methodName = isMethod[5];
  let displayMethodName = methodName;

  if (isMethod[6]) {
    const next = isMethod[6][0];
    if (next === '(') {
      displayMethodName += '()';
    } else if (next === '<') {
      displayMethodName += '<<';
    } else if (next === '[') {
      displayMethodName += '[]';
    } else {
      displayMethodName += '^<<';
    }
  }

  return {
    className: isMethod[4],
    methodName,
    displayMethodName,
  };
}

function getMethodName(text, name, startIndex) {
  const searchName = name.replace(/\?/g, '\\\\?');
  const reg = new RegExp(`${searchName}\\s*(\\(|<<|^<<)?`);
  const nameMatch = text.slice(startIndex).match(reg);
  let methodName = name;

  if (nameMatch && nameMatch[1]) {
    const next = nameMatch[1][0];
    if (next === '(') {
      methodName += '()';
    } else {
      methodName += '<<';
    }
  }

  return methodName;
}

function _findParams(lines, startLine, startRow, startRowIndex, params) {
  const end = lines.length;
  let optional = false;
  let gather = false;

  for (let i = startRow; i < end; i++) {
    const row = startLine + i;
    const text = stringBeforeComment(lines[i]);
    let startIndex = i === startRow ? startRowIndex : 0;
    let endIndex = text.indexOf(')', startIndex);
    if (endIndex === -1) endIndex = text.length;
    const testString = text.substring(startIndex, endIndex);
    let match;

    while (match = VAR_TEST.exec(testString)) { // eslint-disable-line
      const varName = match[0];
      const varIndex = text.indexOf(varName, startIndex);

      if (varName === '_optional') {
        optional = true;
      } else if (varName === '_gather') {
        gather = true;
      } else {
        params[varName] = {
          row,
          index: varIndex,
          count: 1,
          param: true,
          optional,
          gather,
        };
        if (gather) {
          gather = false;
        }
      }

      startIndex = varIndex + 1;
    }

    if (/(\)|<<|\]|^<<)/.test(text)) break;
  }
}

function getMethodParams(lines, startLine) {
  const params = {};
  const end = lines.length - 1;
  let match;

  match = lines[0].match(/(\(|<<|\[|^<<)/);
  if (match) {
    _findParams(lines, startLine, 0, match.index, params);
  }

  // Find internal proc params
  const procReg = /(\s+|\()_proc\s*[@\w!?]*\s*\(/;

  for (let i = 1; i < end; i++) {
    const line = stringBeforeComment(lines[i]);

    match = line.match(procReg);
    if (match) {
      const startIndex = match.index + match[0].length - 1;

      _findParams(lines, startLine, i, startIndex, params);
    }
  }

  return params;
}

function removeSymbolsWithPipes(text) {
  let start = text.indexOf(':|');
  let end;

  while (start !== -1) {
    end = text.indexOf('|', start + 2);
    if (end === -1) {
      start = -1;
    } else {
      text = text.substring(0, start) + text.substring(end + 1);
      start = text.indexOf(':|');
    }
  }

  return text;
}

function previousCharacter(text, index) {
  const match = /\S$/.exec(text.substring(0, index));
  if (match) return match[0];
}

function nextChar(text, index) {
  const match = /\S/.exec(text.slice(index));
  if (match) return match[0];
}

module.exports = {
  MAGIK_KEYWORDS,
  MAGIK_OBJECT_KEYWORDS,
  MAGIK_VARIABLE_KEYWORDS,
  INDENT_INC_WORDS,
  INDENT_DEC_WORDS,
  END_WORDS,
  START_ASSIGN_WORDS,
  END_ASSIGN_WORDS,
  VALID_CHAR,
  INVALID_CHAR,
  VAR_TEST,
  ASSIGN_IGNORE_NEXT,
  VAR_IGNORE_PREV_CHARS,
  DEFINITION_TESTS,
  DEFINE_KEYWORD_TESTS,
  IMPORT_TEST,
  currentWordInString,
  currentWord,
  previousWordInString,
  previousVarInString,
  previousWord,
  nextWordInString,
  nextWord,
  currentClassName,
  currentRegion,
  indentRegion,
  removeStrings,
  withinString,
  stringBeforeComment,
  getPackageName,
  getClassAndMethodName,
  getMethodName,
  getMethodParams,
  removeSymbolsWithPipes,
  previousCharacter,
  nextChar,
};
