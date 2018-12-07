'use strict';

const vscode = require('vscode');
const fs = require('fs')

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
  '_endtry',
  '_endprotection',
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


function compileText(lines) {
  const path = 'C:/temp/temp_magik_vscode.magik';
  const command = `load_file("${path}")\u000D`;
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
    const lines = ['#% text_encoding = iso8859_1', '_package sw', '$'];
    lines.push(text)
    compileText(lines)
  }
}

function getLines(methodOnly) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const selection = editor.selection;
  const startRow = selection.active.line;
  const lines = [];
  let firstRow;
  let lastRow;

  for (let row = startRow; row > 0; row--) {
    const lineText = doc.lineAt(row).text;
    const lineTextTrimmed = lineText.trim();

    lines.unshift(lineText);

    if (lineTextTrimmed.startsWith('_method ') || lineTextTrimmed.includes(' _method ')) {
      firstRow = row;
      break;
    } else if (lineTextTrimmed.startsWith('_endmethod') || lineTextTrimmed === '$') {
      if (!methodOnly) {
        lines.shift();
        firstRow = row + 1;
      }
      break;
    }
  }

  for (let row = startRow + 1; row < doc.lineCount + 1; row++) {
    const lineText = doc.lineAt(row).text;
    const lineTextTrimmed = lineText.trim();

    lines.push(lineText);

    if (lineTextTrimmed.startsWith('_endmethod')) {
      lastRow = row;
      break;
    } else if (lineTextTrimmed.startsWith('_pragma') ||
      lineTextTrimmed.startsWith('_method ') ||
      lineTextTrimmed.includes(' _method ') ||
      lineTextTrimmed === '$') {
      if (!methodOnly) {
        lines.pop();
        lastRow = row - 1;
      }
      break;
    }
  }

  if (firstRow && lastRow) {
    return {lines, firstRow, lastRow};
  }
  return {};
}

function compileMethod() {
  const lines = getLines(true).lines;
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

  const command = `mgoto("^${methodText}$", "${classText}", ${inherit})\u000D`;
  vscode.commands.executeCommand('workbench.action.terminal.focus', {});
  vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {text: command});
}

async function indentMagik(currentRow) {
  const { lines, firstRow } = getLines();
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
      //console.log('Update:', firstRow + row, text, indent);
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
      const lastCol = doc.lineAt(pos.line - 1).text.length;
      const lastPos = new vscode.Position(pos.line - 1, lastCol);
      await addUnderscore(doc, lastPos, '');
      await indentMagik(pos.line - 1);
      await indentMagik(pos.line);
    }
  } else {
    const edit = await addUnderscore(doc, pos, ch);
    if (edit) {
      return [edit];
    }
  }
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
}

exports.activate = activate;
