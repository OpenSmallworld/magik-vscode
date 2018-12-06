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

function compileMethod() {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const selection = editor.selection;
  const startRow = selection.active.line;
  const methodLines = [];
  let startFound = false;
  let endFound = false;

  for (let row = startRow; row > 0; row--) {
    const lineText = doc.lineAt(row).text;
    methodLines.unshift(lineText);
    if (lineText.trim().startsWith('_method ') || lineText.includes(' _method ')) {
      startFound = true;
      break;
    }
  }

  for (let row = startRow + 1; row < doc.lineCount + 1; row++) {
    const lineText = doc.lineAt(row).text;
    const lineTextTrimmed = lineText.trim();
    methodLines.push(lineText);

    if (lineTextTrimmed.startsWith('_endmethod')) {
      endFound = true;
      break;
    }
    if (lineTextTrimmed.startsWith('_pragma')) break;
    if (lineTextTrimmed === '$') break;
  }

  if (startFound && endFound) {
    const parts = methodLines[0].split('.')
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

    methodLines.unshift('$');
    methodLines.unshift('_package sw');
    methodLines.unshift('#% text_encoding = iso8859_1');
    methodLines.push('$')

    // Set source file
    if (methodName) {
      methodLines.push('_block');
      methodLines.push(`_local meth << ${className}.method(:|${methodName}|)`);
      methodLines.push(`_if meth _isnt _unset _then meth.compiler_info[:source_file] << "${doc.fileName}" _endif`);
      methodLines.push('_endblock');
      methodLines.push('$')
    }

    compileText(methodLines);
  }
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

function addUnderscore(doc, pos, ch) {
  const line = doc.lineAt(pos.line);
  const lineText = line.text;
  const text = lineText.slice(0, pos.character);
  const textLength = text.length;

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

    if (length + 1 === textLength || text[textLength - length - 2].search(INVALID_CHAR) === 0) {
      return [vscode.TextEdit.insert(new vscode.Position(pos.line, pos.character - length - 1), '_')];
    }
  }
}


function activate(context) {
  const config = [
    ['goto', goto],
    ['compileMethod', compileMethod],
    ['compileFile', compileFile],
    ['compileSelection', compileSelection]
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
        provideOnTypeFormattingEdits: addUnderscore
      },
      ' ', '.'));
}

exports.activate = activate;
