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

const INDENT_INC_WORDS = [
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
  '_endblock',
  '_endproc',
  '_finally',
];

const END_WORDS = [
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

const START_ASSIGN_WORDS = [
  '_if',
  '_for',
  '_try',
  '_protect',
  '_over',
  '_loop',
  '_while',
  '_proc',
];
const END_ASSIGN_WORDS = [
  '_endif',
  '_endloop',
  '_endtry',
  '_endprotect',
  '_endproc',
];

const VALID_CHAR = /[a-zA-Z0-9_\\?\\!]/;
const INVALID_CHAR = /[^a-zA-Z0-9_\\?\\!]/;

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
    index = text.search(VALID_CHAR);
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

function nextWord(doc, pos, searchNextLine) {
  const line = doc.lineAt(pos.line);
  let text = line.text.slice(pos.character);
  let index = text.search(INVALID_CHAR);
  if (index === -1) return;

  text = text.slice(index);
  index = text.search(VALID_CHAR);
  if (searchNextLine !== false && index === -1) {
    // Try next row - ignore comments
    for (let row = pos.line + 1; row < doc.lineCount; row++) {
      const newText = doc.lineAt(row).text.trim();
      if (newText[0] !== '#') {
        index = newText.search(VALID_CHAR);
        text = newText;
        break;
      }
    }
  }
  if (index === -1) return;

  text = text.slice(index);
  index = text.search(INVALID_CHAR);
  if (index === -1) return text;

  return text.slice(0, index);
}

function currentClassName(doc, pos) {
  const methodReg = /(^|\s+)_method\s+/;

  for (let row = pos.line; row > -1; row--) {
    const text = doc.lineAt(row).text;
    const trim = text.trim();
    if (methodReg.test(trim)) {
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

function currentRegion(methodOnly, startLine) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const methodReg = /(^|\s+)_method\s+/;

  if (!startLine) {
    startLine = editor.selection.active.line;
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

function getMethodParams(doc, lines, startLine) {
  const params = {};
  const linesLength = lines.length;
  const ignore = ['_optional', '_gather'];

  for (let i = 0; i < linesLength; i++) {
    const row = startLine + i;
    const line = lines[i];
    let startIndex = 0;

    if (i === 0) {
      const res = line.match(/(\(|<<|\[)/);
      if (!res) break;
      startIndex = res.index;
    }

    let pos;
    let next;
    do {
      pos = new vscode.Position(row, startIndex);
      next = nextWord(doc, pos, false);
      if (next) {
        startIndex = line.indexOf(next, startIndex);
        if (!ignore.includes(next)) {
          params[next] = {
            row,
            index: startIndex,
            count: 1,
            param: true,
          };
        }
        startIndex += next.length;
      }
    } while (next);

    if (/(\)|<<|\])/.test(line)) break;
  }

  // Find internal proc params
  for (let i = 0; i < linesLength; i++) {
    const row = startLine + i;
    const line = lines[i];

    const match = line.match(/(\s+|\()_proc\s*\(/);
    if (match) {
      let startIndex = match.index + match[0].length - 1;
      const endIndex = line.indexOf(')', startIndex);
      let pos;
      let next;

      do {
        pos = new vscode.Position(row, startIndex);
        next = nextWord(doc, pos, false);
        if (next) {
          startIndex = line.indexOf(next, startIndex);
          if (startIndex > endIndex) break;
          if (!ignore.includes(next)) {
            params[next] = {
              row,
              index: startIndex,
              count: 1,
              param: true,
            };
          }
          startIndex += next.length;
        }
      } while (next);
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

module.exports = {
  MAGIK_KEYWORDS,
  MAGIK_VARIABLE_KEYWORDS,
  INDENT_INC_WORDS,
  INDENT_DEC_WORDS,
  END_WORDS,
  START_ASSIGN_WORDS,
  END_ASSIGN_WORDS,
  VALID_CHAR,
  INVALID_CHAR,
  DEFINITION_TESTS,
  currentWord,
  previousWord,
  nextWord,
  currentClassName,
  currentRegion,
  getClassAndMethodName,
  getMethodParams,
  removeStrings,
};
