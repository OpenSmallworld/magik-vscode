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

const VALID_CHAR = /[a-zA-Z0-9_?!]/;
const INVALID_CHAR = /[^a-zA-Z0-9_?!]/;
const VAR_TEST = /[a-zA-Z0-9_?!]+/g;

const ASSIGN_IGNORE_NEXT = /^\s*(\(|\.|\)\.|(\s*,\s*[a-zA-Z0-9_?!]+)+\s*$)/;
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
  /(_local|_with)\s+([a-zA-Z0-9_?!]+\s*,\s*)*$/,
  /_global\s+([a-zA-Z0-9_?!]+\s*,\s*)*$/,
  /_dynamic\s+([a-zA-Z0-9_?!]+\s*,\s*)*$/,
];
const IMPORT_TEST = /_import\s+([a-zA-Z0-9_?!]+\s*,\s*)*$/;

function previousWordInString(text, index) {
  const match = /[a-zA-Z0-9_?!]+[^a-zA-Z0-9_?!]*[a-zA-Z0-9_?!]*$/.exec(
    text.substr(0, index)
  );
  if (match) {
    const word = match[0];
    const invalidIndex = word.search(INVALID_CHAR);
    if (invalidIndex === -1) return word;
    return word.substr(0, invalidIndex);
  }
}

function previousWord(doc, pos) {
  return previousWordInString(doc.lineAt(pos.line).text, pos.character);
}

function previousVarInString(text, index) {
  const match = /[a-zA-Z0-9_?!]+\s*\.\s*[a-zA-Z0-9_?!]*$/.exec(
    text.substr(0, index)
  );
  if (match && text[match.index - 1] !== '.') {
    return match[0].split('.')[0].trim();
  }
}

function currentWordInString(text, index) {
  const invalidIndex = text.slice(index).search(INVALID_CHAR);
  if (invalidIndex !== -1) {
    return previousWordInString(text, index + invalidIndex + 1);
  }

  const match = /[a-zA-Z0-9_?!]+$/.exec(text);
  if (match) return match[0];
}

function currentWord(doc, pos) {
  return currentWordInString(doc.lineAt(pos.line).text, pos.character);
}

function nextWordInString(text, index) {
  const invalidIndex = text.slice(index).search(INVALID_CHAR);
  if (invalidIndex !== -1) {
    const match = /[a-zA-Z0-9_?!]+/.exec(text.slice(index + invalidIndex));
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
  const methodReg = /(^|\s+)_method\s+/;

  for (let row = pos.line; row > -1; row--) {
    const text = doc.lineAt(row).text;
    const testString = text.trim();
    if (methodReg.test(testString)) {
      const className = text
        .split('_method ')
        .slice(-1)[0]
        .split('.')[0];
      return className.trim();
    }
    if (testString.startsWith('def_slotted_exemplar')) {
      const col = text.indexOf('def_slotted_exemplar') + 20;
      const newPos = new vscode.Position(row, col);
      return nextWord(doc, newPos);
    }
  }
}

function currentRegion(methodOnly, startLine) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};

  const doc = editor.document;
  const methodReg = /(^|\s+)_method\s+/;

  if (!startLine) {
    startLine = editor.selection.active.line;
    if (!startLine) startLine = 0;
  }

  const lines = [];
  const lineCount = doc.lineCount;
  let firstRow;
  let lastRow;

  if (!methodOnly) {
    firstRow = 0;
    lastRow = lineCount - 1;
  }

  for (let row = startLine; row > -1; row--) {
    const lineText = doc.lineAt(row).text;
    const lineTextTrimmed = lineText.trim();

    lines.unshift(lineText);

    if (
      methodReg.test(lineTextTrimmed) ||
      (!methodOnly &&
        lineTextTrimmed.length > 0 &&
        lineText.match(/^\s*/)[0].length === 0)
    ) {
      firstRow = row;
      break;
    } else if (
      row < startLine - 1 &&
      (lineTextTrimmed.startsWith('_endmethod') || lineTextTrimmed === '$')
    ) {
      if (!methodOnly) {
        lines.shift();
        firstRow = row + 1;
      }
      break;
    }
  }

  if (firstRow === undefined) return {};

  for (let row = startLine; row < lineCount; row++) {
    const lineText = doc.lineAt(row).text;
    const lineTextTrimmed = lineText.trim();

    if (row !== startLine) {
      lines.push(lineText);
    }

    if (lineTextTrimmed.startsWith('_endmethod')) {
      lastRow = row;
      break;
    } else if (
      lineTextTrimmed.startsWith('_pragma') ||
      (row !== startLine && methodReg.test(lineTextTrimmed)) ||
      lineTextTrimmed === '$'
    ) {
      if (!methodOnly) {
        lines.pop();
        lastRow = row - 1;
      }
      break;
    }
  }

  if (lastRow === undefined) return {};

  return {lines, firstRow, lastRow};
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
  const parts = text.split('.');
  const className = parts[0]
    .split(/\s/)
    .slice(-1)[0]
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

function getMethodName(text, name, startIndex) {
  const end = startIndex + name.length;
  const next = text.slice(end).search(/\S/);
  let methodName = name;

  if (next !== -1) {
    const nextC = text[end + next];
    if (nextC === '(') {
      methodName += '()';
    } else if (text.substr(end + next, 2) === '<<') {
      methodName += '<<';
    } else if (text.substr(end + next, 3) === '^<<') {
      methodName += '<<';
    }
  }

  return methodName;
}

function _findParams(lines, startLine, startRow, startRowIndex, params) {
  const end = lines.length;
  const ignore = ['_optional', '_gather'];

  for (let i = startRow; i < end; i++) {
    const row = startLine + i;
    const text = lines[i].split('#')[0];
    let startIndex = i === startRow ? startRowIndex : 0;
    let endIndex = text.indexOf(')', startIndex);
    if (endIndex === -1) endIndex = text.length;
    const testString = text.substring(startIndex, endIndex);
    let match;

    while (match = VAR_TEST.exec(testString)) { // eslint-disable-line
      const varName = match[0];
      const varIndex = text.indexOf(varName, startIndex);

      if (!ignore.includes(varName)) {
        params[varName] = {
          row,
          index: varIndex,
          count: 1,
          param: true,
        };
      }

      startIndex = varIndex + 1;
    }

    if (/(\)|<<|\])/.test(text)) break;
  }
}

function getMethodParams(lines, startLine) {
  const params = {};
  const end = lines.length - 1;
  let match;

  match = lines[0].match(/(\(|<<|\[)/);
  if (match) {
    _findParams(lines, startLine, 0, match.index, params);
  }

  // Find internal proc params
  const procReg = /(\s+|\()_proc\s*[@a-zA-Z0-9_?!]*\s*\(/;

  for (let i = 1; i < end; i++) {
    const line = lines[i].split('#')[0];

    match = line.match(procReg);
    if (match) {
      const startIndex = match.index + match[0].length - 1;

      _findParams(lines, startLine, i, startIndex, params);
    }
  }

  return params;
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

function removeSymbolsWithPipes(text) {
  let start = text.indexOf(':|');
  let end;

  while (start !== -1) {
    end = text.indexOf('|', start + 2);
    if (end === -1) {
      start = -1;
    } else {
      text = text.substr(0, start) + text.substr(end + 1);
      start = text.indexOf(':|');
    }
  }

  return text;
}

function previousCharacter(text, index) {
  const match = /\S$/.exec(text.substr(0, index));
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
  getPackageName,
  getClassAndMethodName,
  getMethodName,
  getMethodParams,
  removeStrings,
  withinString,
  removeSymbolsWithPipes,
  previousCharacter,
  nextChar,
};
