'use strict';

const vscode = require('vscode'); // eslint-disable-line
const MagikUtils = require('./utils/magik-utils');

async function addSpaceAfterComma(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();

  for (let row = firstRow; row < lastRow + 1; row++) {
    const lineText = doc.lineAt(row).text;
    const text = MagikUtils.stringBeforeComment(lineText);
    const reg = /(?<!%),(?!( |$))/g;
    let match;

      while (match = reg.exec(text)) { // eslint-disable-line
      const index = match.index;

      if (!MagikUtils.withinString(text, index)) {
        const insertPos = new vscode.Position(row, index + 1);
        edit.insert(doc.uri, insertPos, ' ');
      }
    }
  }

  if (edit.size > 0) {
    await vscode.workspace.applyEdit(edit);
  }
}

async function removeSpacesAfterMethodName(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();

  for (let row = firstRow; row < lastRow + 1; row++) {
    const lineText = doc.lineAt(row).text;
    const text = MagikUtils.stringBeforeComment(lineText);
    const reg = /[\w!?]+\.[\w!?]+\s+\(/g;
    let match;

    while (match = reg.exec(text)) { // eslint-disable-line
      const spaceMatch = /\s+/.exec(match[0]);
      const index = match.index + spaceMatch.index;

      if (!MagikUtils.withinString(text, index)) {
        const spaceMatchLength = spaceMatch[0].length;
        const range = new vscode.Range(
          row,
          index,
          row,
          index + spaceMatchLength
        );
        edit.delete(doc.uri, range);
      }
    }
  }

  if (edit.size > 0) {
    await vscode.workspace.applyEdit(edit);
  }
}

async function removeSpacesBetweenBrackets(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();

  for (let row = firstRow; row < lastRow + 1; row++) {
    const lineText = doc.lineAt(row).text;
    const text = MagikUtils.stringBeforeComment(lineText);
    let reg = /(?<!%)[([{]\s+/g;
    let match;

    while (match = reg.exec(text)) { // eslint-disable-line
      const index = match.index;

      if (!MagikUtils.withinString(text, index)) {
        const matchLength = match[0].length;
        const range = new vscode.Range(
          row,
          index + 1,
          row,
          index + matchLength
        );
        edit.delete(doc.uri, range);
      }
    }

    reg = /(?<!%)\s+[)\]}]/g;

    while (match = reg.exec(text)) { // eslint-disable-line
      const index = match.index;

      if (index !== 0 && !MagikUtils.withinString(text, index)) {
        const matchLength = match[0].length;
        const range = new vscode.Range(
          row,
          index,
          row,
          index + matchLength - 1
        );
        edit.delete(doc.uri, range);
      }
    }
  }

  if (edit.size > 0) {
    await vscode.workspace.applyEdit(edit);
  }
}

async function addSpacesAroundOperators(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();

  // Ignore floating point exponent and negative number
  const ignoreCases = /(\de\+|<<[|])/;
  const ignoreNeg = /[^\w!?] *-\d$/;

  for (let row = firstRow; row < lastRow + 1; row++) {
    const lineText = doc.lineAt(row).text;
    const text = MagikUtils.stringBeforeComment(lineText);
    const firstCharIndex = text.search(/\S/);
    const lastIndex = text.length;
    const reg = /(?<!%)( *)([\^+\-*/]?<<[|]?|>>|\*\*|~=|<>|>=?|<=?|\de\+|\+|-|\*|\/)(\s*)/g;
    let match;

    while (match = reg.exec(text)) { // eslint-disable-line
      const index = match.index;

      if (
        !ignoreCases.test(match[2]) &&
        !MagikUtils.withinString(text, index)
      ) {
        let insert = true;
        let insertText;

        if (match[2] === '-' && match[3].length === 0) {
          const tempStr = lineText.substring(0, index + match[0].length + 1);
          if (ignoreNeg.test(tempStr)) {
            insert = false;
          }
        }

        if (insert) {
          if (match.index === firstCharIndex) {
            if (match.index + match[0].length === lastIndex) {
              insertText = match[2];
            } else {
              insertText = `${match[2]} `;
            }
          } else if (match.index + match[0].length === lastIndex) {
            insertText = ` ${match[2]}`;
          } else {
            insertText = ` ${match[2]} `;
          }

          if (insertText !== match[0]) {
            const matchLength = match[0].length;
            const range = new vscode.Range(
              row,
              index,
              row,
              index + matchLength
            );
            edit.replace(doc.uri, range, insertText);
          }
        }
      }
    }
  }

  if (edit.size > 0) {
    await vscode.workspace.applyEdit(edit);
  }
}

async function addNewlineAfterDollar(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  let row = firstRow;

  const edit = new vscode.WorkspaceEdit();

  while (row < lastRow) {
    const lineText = doc.lineAt(row).text;

    if (lineText[0] === '$') {
      const nextLineText = doc.lineAt(row + 1).text;

      if (nextLineText.trim() !== '') {
        const insertPos = new vscode.Position(row + 1, 0);
        edit.insert(doc.uri, insertPos, '\n');
      }
    }

    row++;
  }

  if (edit.size > 0) {
    await vscode.workspace.applyEdit(edit);
  }
}

// TODO format comment blocks

async function wrapComment(currentRow, ch) {
  const wrapLength = vscode.workspace.getConfiguration('magik-vscode')
    .wrapCommentLineLength;
  if (wrapLength < 1) return;

  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const lineText = doc.lineAt(currentRow).text;

  if (lineText.length > wrapLength && /^\s*#/.test(lineText)) {
    const match = /^\s*##?\S*\s/.exec(lineText);
    if (match) {
      const start = match.length;

      for (let i = wrapLength; i > start; i--) {
        if (/\s/.test(lineText[i])) {
          const edit = new vscode.WorkspaceEdit();

          if (ch === '\n') {
            const startString = /##?/.exec(lineText)[0];
            const newText = `${startString} ${lineText.slice(i + 1)}`;
            const range = new vscode.Range(
              currentRow,
              i,
              currentRow,
              lineText.length
            );
            edit.delete(doc.uri, range);
            const insertPos = new vscode.Position(currentRow + 1, 1);
            edit.insert(doc.uri, insertPos, newText);
          } else {
            const startString = /^\s*##?/.exec(lineText)[0];
            const newText = `\n${startString} ${lineText.slice(i + 1)}`;
            const range = new vscode.Range(
              currentRow,
              i,
              currentRow,
              lineText.length
            );
            edit.replace(doc.uri, range, newText);
          }

          await vscode.workspace.applyEdit(edit); // eslint-disable-line
          break;
        }
      }
    }
  }
}

async function checkSymbolPipe(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();

  for (let row = firstRow; row < lastRow + 1; row++) {
    const lineText = doc.lineAt(row).text;
    const text = MagikUtils.stringBeforeComment(lineText);
    const reg = /:([\w!?]+)\|(\??\^?(\(\)(<<)?|<<))\|/g;
    let match;

      while (match = reg.exec(text)) { // eslint-disable-line
      const index = match.index;

      if (!MagikUtils.withinString(text, index)) {
        const matchLength = match[0].length;
        const range = new vscode.Range(
          row,
          index,
          row,
          index + matchLength
        );
        const insertText = `:|${match[1]}${match[2]}|`;
        edit.replace(doc.uri, range, insertText);
      }
    }
  }

  if (edit.size > 0) {
    await vscode.workspace.applyEdit(edit);
  }
}

module.exports = {
  addSpaceAfterComma,
  removeSpacesAfterMethodName,
  removeSpacesBetweenBrackets,
  addSpacesAroundOperators,
  addNewlineAfterDollar,
  wrapComment,
  checkSymbolPipe,
};
