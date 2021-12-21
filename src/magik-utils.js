'use strict';

const vscode = require('vscode'); // eslint-disable-line
const path = require('path');
const cp = require('child_process');

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
  'locking',
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
  'cf',
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
  '_cf',
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

const PRAGMA_WORDS = [
  'basic',
  'advanced',
  'restricted',
  'debug',
  'deprecated',
  'external',
  'internal',
  'subclassable',
  'redefinable',
];

const VALID_CHAR = /[\w!?]/;
const INVALID_CHAR = /[^\w!?]/;
const VAR_TEST = /[\w!?]+/g;
const INC_BRACKETS = /(?<!%)[({]/g;
const DEC_BRACKETS = /(?<!%)[)}]/g;

const ASSIGN_IGNORE_NEXT = /^\s*(\(|\.|\)\.|(\s*,\s*(?=([\w!?]+)))+\s*$)/;
const VAR_IGNORE_PREV_CHARS = ['.', ':', '"', '%', '|', '@'];

const DEFINITION_TESTS = [
  {
    test: new RegExp(
      `(^|\\s+)_private\\s+(_iter\\s+)?_method\\s+[\\w!?]+\\s*\\.\\s*.+`
    ),
    type: vscode.SymbolKind.Function,
  },
  {
    test: new RegExp(`(^|\\s+)_method\\s+[\\w!?]+\\s*\\.\\s*.+`),
    type: vscode.SymbolKind.Method,
  },
  {
    test: new RegExp(`\\.\\s*define_shared_constant\\s*\\(\\s*($|:.+)`),
    type: vscode.SymbolKind.Constant,
  },
  {
    test: new RegExp(
      `\\.\\s*(define_slot_access|define_shared_variable|define_slot_externally_readable|define_slot_externally_writable)\\s*\\(\\s*($|:.+)`
    ),
    type: vscode.SymbolKind.Variable,
  },
  {
    test: new RegExp(`\\.\\s*(def_property|define_property)\\s*\\(\\s*($|:.+)`),
    type: vscode.SymbolKind.Property,
  },
  {
    test: new RegExp(`^def_slotted_exemplar\\s*\\(\\s*($|:.+)`),
    type: vscode.SymbolKind.Class,
  },
];
const DEFINE_KEYWORD_TESTS = [
  /(_local|_with)\s+((?=([\w!?]+))\s*,\s*)*$/,
  /_global\s+((?=([\w!?]+))\s*,\s*)*$/,
  /_dynamic\s+((?=([\w!?]+))\s*,\s*)*$/,
];
const IMPORT_TEST = /_import\s+((?=([\w!?]+))\s*,\s*)*$/;

const MAGIK_PROMPT = '# Magik>';

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
  const line = pos.line;
  let word = nextWordInString(doc.lineAt(line).text, pos.character);
  if (word || searchNextLine === false) {
    return {word, row: line};
  }

  const endRow = doc.lineCount;

  for (let row = line + 1; row < endRow; row++) {
    const text = doc.lineAt(row).text;
    const firstChar = text.trim()[0];

    if (firstChar !== undefined && firstChar !== '#') {
      word = nextWordInString(text, 0);
      if (word) return {word, row};
    }
  }
}

function nextWordInFile(fileLines, line, col, searchNextLine) {
  let word = nextWordInString(fileLines[line], col);
  if (word || searchNextLine === false) {
    return {word, row: line};
  }

  const endRow = fileLines.length;

  for (let row = line + 1; row < endRow; row++) {
    const text = fileLines[row];
    const firstChar = text.trim()[0];

    if (firstChar !== undefined && firstChar !== '#') {
      word = nextWordInString(text, 0);
      if (word) return {word, row};
    }
  }
}

function currentClassName(doc, currentLine, startLine) {
  const methodReg = /(^|\s+)_method\s+([\w!?]+)\s*\./;
  const exemplarReg = /(^|\s*)def_slotted_exemplar\s*\(/;
  const defineReg = /(^|\s*)([\w!?]+)\s*\.\s*(define_|def_)\w+\s*\(/;

  if (!startLine) {
    startLine = 0;
  }

  for (let row = currentLine; row > startLine - 1; row--) {
    const testString = doc.lineAt(row).text;
    const methodMatch = methodReg.exec(testString);

    if (methodMatch) {
      return methodMatch[2];
    }

    const defineMatch = defineReg.exec(testString);
    if (defineMatch) {
      return defineMatch[2];
    }

    if (exemplarReg.test(testString)) {
      const col = testString.indexOf('def_slotted_exemplar') + 20;
      const newPos = new vscode.Position(row, col);
      return nextWord(doc, newPos).word;
    }
  }
}

function allClassNames(doc) {
  const classNames = new Set();
  const methodReg = /(^|\s+)_method\s+([\w!?]+)\s*\./;
  const exemplarReg = /(^|\s*)def_slotted_exemplar\s*\(/;
  const defineReg = /(^|\s*)([\w!?]+)\s*\.\s*(define_|def_)\w+\s*\(/;
  const lineCount = doc.lineCount;

  for (let row = 0; row < lineCount; row++) {
    const testString = doc.lineAt(row).text;
    const methodMatch = methodReg.exec(testString);

    if (methodMatch) {
      classNames.add(methodMatch[2]);
    } else {
      const defineMatch = defineReg.exec(testString);

      if (defineMatch) {
        classNames.add(defineMatch[2]);
      } else if (exemplarReg.test(testString)) {
        const col = testString.indexOf('def_slotted_exemplar') + 20;
        const newPos = new vscode.Position(row, col);
        const className = nextWord(doc, newPos).word;

        if (className) {
          classNames.add(className);
        }
      }
    }
  }

  return Array.from(classNames);
}

function lastPragma(doc, currentLine) {
  const pragmaTest = /^\s*_pragma\s*\(/;

  for (let row = currentLine; row > -1; row--) {
    const testString = doc.lineAt(row).text;

    if (pragmaTest.test(testString)) {
      return testString;
    }
  }
}

function getRegion(doc, methodOnly, startLine) {
  const startMethodReg = /^\s*(_abstract\s+)*(_private\s+)*(_iter\s+)*_method\s+/;
  const endMethodReg = /^\s*_endmethod/;
  const previousReg = new RegExp(
    `^(\\s*\\$|\\s*_endmethod|_endblock|${MAGIK_PROMPT})`
  );
  const nextReg = /^(\s*\$|\s*_pragma|\s*(_abstract\s+)*(_private\s+)*(_iter\s+)*_method\s+|_block)/;
  const startReg = /^_block/;
  const endReg = /^_endblock/;

  if (!startLine) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return {};

    startLine = editor.selection.active.line || 0;
    if (startLine > 0 && doc.lineAt(startLine).text === '') {
      startLine--;
    }
  }

  const lineCount = doc.lineCount;

  if (startLine < 0 || startLine >= lineCount) {
    return {};
  }

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

function currentRegion(methodOnly, startLine) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};

  return getRegion(editor.document, methodOnly, startLine);
}

function indentRegion() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};

  const doc = editor.document;
  const previousReg = new RegExp(
    `^(\\s*\\$|\\s*_endmethod|_endblock|${MAGIK_PROMPT})`
  );
  const nextReg = /^(\s*\$|\s*_pragma|\s*(_abstract\s+)*(_private\s+)*(_iter\s+)*_method\s+|_block)/;
  const startReg = /^(_pragma|_method|_private|_iter|_abstract|_global|_proc|_block)/;

  let startLine = editor.selection.active.line;
  if (!startLine) startLine = 0;

  const lines = [];
  const lineCount = doc.lineCount;
  let firstRow = 0;
  let lastRow = lineCount - 1;

  for (let row = startLine; row > -1; row--) {
    const lineText = doc.lineAt(row).text;
    // const lineTextTrimmed = lineText.trim();

    lines.unshift(lineText);

    if (row < startLine - 1 && previousReg.test(lineText)) {
      lines.shift();
      firstRow = row + 1;
      break;
    } else if (
      // lineTextTrimmed.length > 0 &&
      // lineText.match(/^\s*/)[0].length === 0
      startReg.test(lineText)
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
  if (text.indexOf('"') === -1) return text;

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

  return 'user';
}

function getClassAndMethodName(text) {
  const isMethod = text.match(
    /^\s*(_abstract)?\s*(_private)?\s*(_iter)?\s*_method\s+([\w!?]+)\s*\.\s*([\w!?]+)\s*(\(|<<|\[|^<<)?/
  );

  if (!isMethod) {
    return {};
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
  const searchName = name.replace(/\?/g, '\\?');
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
  const varTest = /[\w!?]+/g;
  const end = lines.length;
  let optional = false;
  let gather = false;

  // console.log('PARAMS');

  for (let i = startRow; i < end; i++) {
    const row = startLine + i;
    const text = stringBeforeComment(lines[i]);
    let startIndex = i === startRow ? startRowIndex : 0;
    let endIndex = text.indexOf(')', startIndex);
    if (endIndex === -1) endIndex = text.length;
    const testString = text.substring(startIndex, endIndex);
    let match;

    // console.log('TEST', text, startIndex, testString);

    while (match = varTest.exec(testString)) { // eslint-disable-line
      const varName = match[0];
      const varIndex = text.indexOf(varName, startIndex);

      if (varName === '_optional') {
        optional = true;
      } else if (varName === '_gather') {
        gather = true;
      } else {
        // console.log('VAR', varName);
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

  // console.log(' ');
}

function getMethodParams(lines, startLine, procs) {
  const params = {};

  if (lines.length === 0) return params;

  const testReg = /^\s*(_pragma|#|$)/;
  const end = lines.length - 1;
  let startRow = 0;
  for (let i = 0; i < end; i++) {
    if (!testReg.test(lines[i])) {
      startRow = i;
      break;
    }
  }
  let match = lines[startRow].match(/(\(|<<|\[|^<<)/);

  if (match) {
    _findParams(lines, startLine, startRow, match.index, params);
  }

  if (procs !== false) {
    const procReg = /(^|\s+|\()_proc\s*[|@\w!?]*\s*\(/;

    for (let i = 1; i < end; i++) {
      const line = stringBeforeComment(lines[i]);

      match = line.match(procReg);
      if (match) {
        const startIndex = match.index + match[0].length - 1;

        _findParams(lines, startLine, i, startIndex, params);
      }
    }
  }

  return params;
}

function _bracketCount(testString) {
  let count = 0;
  let cIndex = 0;
  let lastChar;

  for (const c of testString) {
    if (lastChar !== '%') {
      if ((c === '(' || c === '{') && !withinString(testString, cIndex)) {
        count++;
      } else if (
        (c === ')' || c === '}') &&
        !withinString(testString, cIndex)
      ) {
        count--;
      }
    }
    lastChar = c;
    cIndex++;
  }

  return count;
}

function findArgs(lines, startLine, startRow, startRowIndex) {
  const end = lines.length;
  let argString = '';
  let lastChar;
  let bracketCount = 1;

  // Gather complete argment string - find closing bracket
  for (let i = startRow; i < end; i++) {
    const text = stringBeforeComment(lines[i]);
    const testString =
      i === startRow ? text.substring(startRowIndex) : ` ${text.trimLeft()}`;

    let cIndex = 0;
    for (const c of testString) {
      if (lastChar !== '%') {
        if (c === '(' && !withinString(testString, cIndex)) {
          bracketCount++;
        } else if (c === ')' && !withinString(testString, cIndex)) {
          bracketCount--;
          if (bracketCount === 0) {
            argString += testString.substring(0, cIndex);
            break;
          }
        }
      }
      lastChar = c;
      cIndex++;
    }

    if (bracketCount === 0) {
      break;
    }
    argString += testString;
  }

  if (bracketCount !== 0) {
    return;
  }

  // Split string at commas (not inside strings)
  const args = [];
  let cIndex = 0;
  let startIndex = 0;
  lastChar = undefined;
  for (const c of argString) {
    if (lastChar !== '%') {
      if (c === ',' && !withinString(argString, cIndex)) {
        args.push(argString.substring(startIndex, cIndex));
        startIndex = cIndex + 1;
      }
    }
    lastChar = c;
    cIndex++;
  }
  args.push(argString.substring(startIndex, argString.length));

  // Combine args to match brackets
  let argIndex = 0;
  while (argIndex < args.length - 1) {
    const str = args[argIndex];
    const count = _bracketCount(str);
    if (count > 0) {
      args[argIndex + 1] = `${str},${args[argIndex + 1]}`;
      args.splice(argIndex, 1);
    } else {
      argIndex++;
    }
  }

  return args.map((str) => str.trim());
}

function localSlots(doc, pos) {
  const slotNames = [];
  const className = currentClassName(doc, pos.line);
  if (!className) {
    return slotNames;
  }

  const defTest = new RegExp(
    `^\\s*def_slotted_exemplar\\s*\\(\\s*:${className}`
  );
  const endTest = /(\}\s*$|\}\s*\}\s*,\s*$|^\s*_pragma|^\s*\$\s*$|\)\s*$|^\s*\{\s*\}\s*,\s*$)/;
  const slotTest = /\{\s*\{?\s*:([\w!?]+)\s*,/g;

  const lineCount = doc.lineCount;
  let foundDef = false;
  let match;

  for (let row = 0; row < lineCount; row++) {
    const lineText = doc.lineAt(row).text;

    if (!foundDef && defTest.test(lineText)) {
      foundDef = true;
    }

    if (foundDef) {
      const text = stringBeforeComment(lineText);

      while (match = slotTest.exec(text)) { // eslint-disable-line
        slotNames.push(match[1]);
      }

      if (endTest.test(text)) {
        break;
      }
    }
  }

  return slotNames;
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

function debounce(callback, wait) {
  let timeout;
  return (...args) => {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => callback.apply(context, args), wait);
  };
}

async function sendToTerminal(stringToSend) {
  const processName = vscode.workspace.getConfiguration('magik-vscode')
    .magikProcessName;

  if (processName !== '') {
    const appName = vscode.env.appName;
    const ext = vscode.extensions.getExtension('GE-Smallworld.magik-vscode');
    const scriptName = isNaN(processName)
      ? 'sendToMagikName.vbs'
      : 'sendToMagikID.vbs';
    const file = path.join(ext.extensionPath, 'scripts', scriptName);
    let text = stringToSend;
    for (const c of ['~', '!', '^', '+', '(', ')']) {
      text = text.replace(new RegExp(`\\${c}`, 'g'), `{${c}}`);
    }
    text = text.replace(/"/g, "'");
    const command = `cscript ${file} "${appName}" "${processName}" "${text}"`;
    await cp.execSync(command);
  } else {
    const command = `${stringToSend}\u000D`;

    if (
      vscode.workspace.getConfiguration('magik-vscode').enableAutoScrollToPrompt
    ) {
      vscode.commands.executeCommand(
        'workbench.action.terminal.scrollToBottom',
        {}
      );
    }

    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
      text: command,
    });
  }
}

function getDocEditor(doc) {
  for (const ed of vscode.window.visibleTextEditors) {
    if (ed.document === doc) {
      return ed;
    }
  }
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
  PRAGMA_WORDS,
  VALID_CHAR,
  INVALID_CHAR,
  VAR_TEST,
  INC_BRACKETS,
  DEC_BRACKETS,
  ASSIGN_IGNORE_NEXT,
  VAR_IGNORE_PREV_CHARS,
  DEFINITION_TESTS,
  DEFINE_KEYWORD_TESTS,
  IMPORT_TEST,
  MAGIK_PROMPT,
  currentWordInString,
  currentWord,
  previousWordInString,
  previousVarInString,
  previousWord,
  nextWordInString,
  nextWord,
  nextWordInFile,
  currentClassName,
  allClassNames,
  lastPragma,
  getRegion,
  currentRegion,
  indentRegion,
  removeStrings,
  withinString,
  stringBeforeComment,
  getPackageName,
  getClassAndMethodName,
  getMethodName,
  getMethodParams,
  findArgs,
  localSlots,
  removeSymbolsWithPipes,
  previousCharacter,
  nextChar,
  debounce,
  sendToTerminal,
  getDocEditor,
};
