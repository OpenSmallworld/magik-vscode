'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

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

const MAGIK_VARIABLE_KEYWORDS = [
  'self',
  'super',
  'clone',
  'thisthread'
];

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
  '_proc'
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
  '_endproc'
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
  '_xor'
];
const endWordsLength = endWords.length;

const startAssignWords = [
  '_if',
  '_for',
  '_try',
  '_protect',
  '_loop'
];
const endAssignWords = [
  '_endif',
  '_endloop',
  '_endtry',
  '_endprotect'
];

const openFiles = [];


function compileText(lines) {
  const path = 'C:/temp/temp_magik_vscode.magik';
  const command = 'vs_load()\u000D';
  const output = lines.join('\r\n');

  fs.writeFileSync(path, output);

  vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {text: command});
}

function compileFile() {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const {fileName} = doc;

  if (fileName.split('.').slice(-1)[0] === "magik") {
    const command = `load_file("${fileName}")\u000D`;
    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {text: command});
  }
}

function compileSelection() {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const selection = editor.selection;

  if (!selection.empty) {
    const text = doc.getText(new vscode.Range(selection.start, selection.end));
    const lines = ['#% text_encoding = iso8859_1', '_package sw', '$', '# Output:Loading selection ...'];
    lines.push(text)
    compileText(lines)
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

    if (lineTextTrimmed.startsWith('_method ') || lineTextTrimmed.includes(' _method ')) {
      firstRow = row;
      break;
    } else if (row < startRow - 1 && (lineTextTrimmed.startsWith('_endmethod') || lineTextTrimmed === '$')) {
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
    } else if (lineTextTrimmed.startsWith('_pragma') ||
      (row !== startRow && (lineTextTrimmed.startsWith('_method ') || lineTextTrimmed.includes(' _method '))) ||
      lineTextTrimmed === '$') {
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

  const parts = lines[0].split('.')
  const className = parts[0].split(' ').splice(-1)[0].trim();
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
  lines.push('$')

  // Set source file
  if (methodName) {
    lines.push('_block');
    lines.push(`_local meth << ${className}.method(:|${methodName}|)`);
    lines.push(`_if meth _isnt _unset _then meth.compiler_info[:source_file] << "${doc.fileName}" _endif`);
    lines.push('_endblock');
    lines.push('$')
  }

  compileText(lines);
}

function goto() {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const selection = editor.selection;
  const position = selection.active;
  const col = position.character;
  const text = doc.lineAt(position.line).text;
  let revText;
  let start;
  let end;

  revText = text.slice(0, col);
  revText = revText.split('').reverse().join('');
  start = revText.search(INVALID_CHAR);
  if (start === -1) return;

  start = col - start;

  end = text.slice(col).search(INVALID_CHAR);
  if (end === -1) {
    end = text.length;
  } else {
    end = col + end;
  }

  if (start === end) return;

  let methodText = text.slice(start, end).trim();

  const next = text.slice(end).search(/\S/);
  if (next !== -1) {
    const nextChar = text[end + next];
    if (nextChar === '(') {
      methodText += '()';
    } else if (nextChar === '<' && text[end + next + 1] === '<') {
      methodText += '<<';
    }
  }

  let classText = previousWord(doc, position);
  let inherit = '_false';

  if (['_self', '_super', '_clone'].includes(classText)) {
    const className = currentClassName(doc, position);
    if (className) {
      if (classText === '_super') {
        inherit = '_true';
      }
      classText = className;
    }
  }

  const command = `vs_goto("^${methodText}$", "${classText}", ${inherit})\u000D`;
  vscode.commands.executeCommand('workbench.action.terminal.focus', {});
  vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {text: command});
}

async function indentMagik(currentRow) {
  const { lines, firstRow } = currentRegion();
  if (!lines) return;

  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;

  const incBrackets = /[\(\{]/g;
  const decBrackets = /[\)\}]/g;
  let indent = 0;
  let tempIndent = false;
  let assignIndentRow;

  for (let row = 0; row < lines.length; row++) {
    const text = lines[row];
    const textLength = text.length;
    const trim = text.trim();
    let start = text.search(/\S/);
    let matches;

    if (start === -1) start = textLength;

    if (trim !== '#') {
      for (let i = 0; i < decWordsLength; i++) {
        if (trim.startsWith(decWords[i])) {
          indent--;
          break;
        }
      }
    }

    const indentText = (indent === 0) ? '' : new Array(indent + 1).join('\t');

    if (indentText !== text.slice(0, start)) {
      if (!currentRow || firstRow + row === currentRow) {
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(firstRow + row, 0, firstRow + row, start);
        edit.replace(doc.uri, range, indentText);
        await vscode.workspace.applyEdit(edit);
      }
    }

    if (firstRow + row === currentRow) return;

    if (trim[0] === '#') continue;

    if (assignIndentRow) {
      if (row === assignIndentRow + 1) {
        let found = false;
        for (let i = 0; i < startAssignWords.length; i++) {
          if (trim.startsWith(startAssignWords[i])) {
            found = true;
            break;
          }
        }
        if (!found) {
          indent--;
          assignIndentRow = undefined;
        }
      } else {
        for (let i = 0; i < endAssignWords.length; i++) {
          if (trim.startsWith(endAssignWords[i])) {
            indent--;
            assignIndentRow = undefined;
            break;
          }
        }
      }
    } else if (tempIndent) {
      indent--;
      tempIndent = false;
    }

    if (trim.startsWith('_method ') || trim.includes(' _method ')) {
      indent++;
    } else {
      for (let i = 0; i < incWordsLength; i++) {
        if (trim.startsWith(incWords[i])) {
          indent++;
          break;
        }
      }
    }

    // Remove strings and comments before counting brackets
    const noStrings = removeStrings(text).split('#')[0];

    matches = noStrings.match(incBrackets);
    if (matches) {
      indent += matches.length;
    }
    matches = noStrings.match(decBrackets);
    if (matches) {
      indent -= matches.length;
    }

    const beforeComment = trim.split('#')[0].trim();

    if (textLength > 2 && beforeComment.slice(-2) === '<<') {
      indent++;
      assignIndentRow = row;
    } else {
      for (let i = 0; i < endWordsLength; i++) {
        const word = endWords[i];
        if (beforeComment.slice(-word.length) === word) {
          indent++;
          tempIndent = true;
          break;
        }
      }
    }
  }
}

function currentClassName(doc, pos) {
  for (let row = pos.line; row > 0; row--) {
    const text = doc.lineAt(row).text;
    if (text.trim().startsWith('_method ') || text.includes(' _method ')) {
      const className = text.split('_method ').splice(-1)[0].split('.')[0];
      return className.trim();
    }
  }
}

function currentWord(doc, pos) {
  const col = pos.character;
  const text = doc.lineAt(pos.line).text;
  let revText;
  let start;
  let end;

  revText = text.slice(0, col);
  revText = revText.split('').reverse().join('');
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

function previousWord(doc, pos) {
  const line = doc.lineAt(pos.line);
  let text = line.text.slice(0, pos.character);
  let index;

  text = text.split('').reverse().join('');

  index = text.search(INVALID_CHAR);
  if (index === -1) return;

  text = text.slice(index).trim();
  if (text[0] !== '.') return;

  text = text.slice(1).trim();
  index = text.search(INVALID_CHAR);
  if (index === -1) index = text.length;

  text = text.slice(0, index);
  return text.split('').reverse().join('');
}

function removeStrings(text) {
  const textLength = text.length;
  let noStrings = [];
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

  const keywords = (ch === '.') ? MAGIK_VARIABLE_KEYWORDS : MAGIK_KEYWORDS;
  const keywordsLength = keywords.length;

  for (let index = 0; index < keywordsLength; index++) {
    const keyword = keywords[index];
    const length = keyword.length;

    if (length > textLength) continue;

    let last = text.slice(-length - 1).trim();
    if (ch === '.') {
      last = last.slice(0, last.length - 1);
    }
    if (last !== keyword) continue;

    if (ch === '') {
      if (length === textLength || text[textLength - length - 1].search(INVALID_CHAR) === 0) {
        // Make the change now before checking the indentation
        const edit = new vscode.WorkspaceEdit();
        const insertPos = new vscode.Position(pos.line, pos.character - length);
        edit.insert(doc.uri, insertPos, '_');
        await vscode.workspace.applyEdit(edit);
      }
    } else {
      if (length + 1 === textLength || text[textLength - length - 2].search(INVALID_CHAR) === 0) {
        return vscode.TextEdit.insert(new vscode.Position(pos.line, pos.character - length - 1), '_');
      }
    }
  }
}

async function formatMagik(doc, pos, ch) {
  if (ch === '\n') {
    if (vscode.workspace.getConfiguration('magik-vscode').enableAutoIndentation) {
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
  const lines = fs.readFileSync(fileName).toString().split('\n'); // TODO replace this
  const lineCount = lines.length;

  const methodTest = new RegExp(`(^_method | _method ).+\\.\\s*(${word})`);
  const defineTest = new RegExp(`\\.\\s*(define_slot_access|define_shared_constant|def_property|define_property|define_shared_variable)\\s*\\(\\s*:(${word})`);

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

// TODO - only looking in current file, other open files and magik files in the current folder!
function getMagikDefinition(doc, pos) {
  const previous = previousWord(doc, pos);
  if (previous !== '_self') return;

  const current = currentWord(doc, pos);

  // const methodTest = new RegExp(`(^_method | _method ).+\\.\\s*(${current})`);
  // const defineTest = new RegExp(`\\.\\s*(define_slot_access|define_shared_constant|def_property|define_property|define_shared_variable)\\s*\\(\\s*:(${current})`);
  // const lineCount = doc.lineCount;

  // for (let row = 0; row < lineCount; row++) {
  //   const line = doc.lineAt(row);
  //   const text = line.text;
  //   let index = text.search(methodTest);
  //   if (index === -1) {
  //     index = text.search(defineTest);
  //   }

  //   if (index !== -1) {
  //     index = text.indexOf(current, index);
  //     const range = new vscode.Range(row, index, row, index + current.length);
  //     return new vscode.Location(doc.uri, range);
  //   }
  // }

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

    if (!doneFileNames.includes(fileName) && path.extname(fileName) === '.magik') {
      const loc = findDefinition(fileName, current);
      if (loc) return loc;
      doneFileNames.push(fileName);
    }
  }

  // Check other magik files from the directory
  const files = getMagikFilesInDirectory(currentDir);

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];

    if (!doneFileNames.includes(fileName)) {
      const loc = findDefinition(fileName, current);
      if (loc) return loc;
      doneFileNames.push(fileName);
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
    let index = text.indexOf(current);

    if (index !== -1) {
      const range = new vscode.Range(row, index, row, index + current.length);
      const loc = new vscode.Location(uri, range);
      locs.push(loc);
    }
  }

  return locs;
}

// TODO - currently only looking for method definitions
function getMagikSymbols(doc) {
  const symbols = [];
  const methodTest = new RegExp(`(^_method | _method ).+\\.\\s*.+`);
  const methodType = vscode.SymbolKind.Method;
  const lineCount = doc.lineCount;
  const uri = doc.uri;

  for (let row = 0; row < lineCount; row++) {
    const text = doc.lineAt(row).text;

    if (text.search(methodTest) !== -1) {
      const parts = text.split('.')
      const className = parts[0].split(' ').splice(-1)[0].trim();
      let methodName;

      if (parts.length > 1) {
        methodName = parts[1].trim();
        let index = methodName.search(INVALID_CHAR);
        if (index === -1) index = methodName.length;
        methodName = methodName.slice(0, index);
        index = text.indexOf(methodName);
        const range = new vscode.Range(row, index, row, index + methodName.length);
        const sym = new vscode.SymbolInformation(methodName, methodType, range, uri, className);
        symbols.push(sym);
      }
    }
  }

  return symbols;
}

function activate(context) {
  const config = [
    ['goto', goto],
    ['compileMethod', compileMethod],
    ['compileFile', compileFile],
    ['compileSelection', compileSelection],
    ['indentMethod', indentMagik]
  ];

  for (const [name, func] of config) {
    const disposable = vscode.commands.registerCommand(`magik.${name}`, func);
    context.subscriptions.push(disposable);
  };

  context.subscriptions.push(
    vscode.languages.registerOnTypeFormattingEditProvider(
      {
        scheme: 'file',
        language: 'magik'
      },
      {
        provideOnTypeFormattingEdits: formatMagik
      },
      ' ', '.', '\n'));

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      {
        scheme: 'file',
        language: 'magik'
      },
      {
        provideDefinition: getMagikDefinition
      }));

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(
      {
        scheme: 'file',
        language: 'magik'
      },
      {
        provideReferences: getMagikReferences
      }));

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      {
        scheme: 'file',
        language: 'magik'
      },
      {
        provideDocumentSymbols: getMagikSymbols
      }));

  // No api for open editors
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        const fileName = editor.document.fileName;
        const index = openFiles.indexOf(fileName);
        if (index === -1) {
          openFiles.push(fileName);
        } else {
          openFiles.splice(index, 1);
        }
      }
    }));
}

exports.activate = activate;
