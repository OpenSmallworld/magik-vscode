'use strict';

const vscode = require('vscode'); // eslint-disable-line
const magikUtils = require('./magik-utils');

async function addSpaceAfterComma(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;

  for (let row = firstRow; row < lastRow + 1; row++) {
    const lineText = doc.lineAt(row).text;
    let text = magikUtils.stringBeforeComment(lineText);
    const reg = /(?<!%),(?!( |$))/g;
    let match;

      while (match = reg.exec(text)) { // eslint-disable-line
      const index = match.index;

      if (!magikUtils.withinString(text, index)) {
        const edit = new vscode.WorkspaceEdit();
        const insertPos = new vscode.Position(row, index + 1);
        edit.insert(doc.uri, insertPos, ' ');
        await vscode.workspace.applyEdit(edit); // eslint-disable-line
        text = `${text.substring(0, index + 1)} ${text.substring(index + 1)}`;
      }
    }
  }
}

async function removeSpacesAfterMethodName(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;

  for (let row = firstRow; row < lastRow + 1; row++) {
    const lineText = doc.lineAt(row).text;
    let text = magikUtils.stringBeforeComment(lineText);
    const reg = /[\w!?]+\.[\w!?]+\s+\(/g;
    let match;

      while (match = reg.exec(text)) { // eslint-disable-line
      const spaceMatch = /\s+/.exec(match[0]);
      const index = match.index + spaceMatch.index;

      if (!magikUtils.withinString(text, index)) {
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(
          row,
          index,
          row,
          index + spaceMatch[0].length
        );
        edit.delete(doc.uri, range);
        await vscode.workspace.applyEdit(edit); // eslint-disable-line
        text = `${text.substring(0, index)}${text.substring(
          index + spaceMatch[0].length
        )}`;
      }
    }
  }
}

async function removeSpacesBetweenBrackets(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;

  for (let row = firstRow; row < lastRow + 1; row++) {
    let text = magikUtils.stringBeforeComment(doc.lineAt(row).text);
    let reg = /(?<!%)[([{](?= )/g;
    let match;

      while (match = reg.exec(text)) { // eslint-disable-line
      const index = match.index;

      if (!magikUtils.withinString(text, index)) {
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(row, index + 1, row, index + 2);
        edit.delete(doc.uri, range);
        await vscode.workspace.applyEdit(edit); // eslint-disable-line
        text = text.substring(0, index + 1) + text.substring(index + 2);
      }
    }

    reg = /(?<= )[)\]}]/g;

      while (match = reg.exec(text)) { // eslint-disable-line
      const index = match.index;

      if (!magikUtils.withinString(text, index)) {
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(row, index - 1, row, index);
        edit.delete(doc.uri, range);
        await vscode.workspace.applyEdit(edit); // eslint-disable-line
        text = text.substring(0, index - 1) + text.substring(index);
      }
    }
  }
}

async function addNewlineAfterDollar(firstRow, lastRow) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor.document;
  let last = lastRow;
  let row = firstRow;

  while (row < last) {
    const lineText = doc.lineAt(row).text;

    if (lineText[0] === '$') {
      const nextLineText = doc.lineAt(row + 1).text;

      if (nextLineText.trim() !== '') {
        const edit = new vscode.WorkspaceEdit();
        const insertPos = new vscode.Position(row + 1, 0);
        edit.insert(doc.uri, insertPos, '\n');
        await vscode.workspace.applyEdit(edit); // eslint-disable-line
        last++;
      }

      row += 2;
    } else {
      row++;
    }
  }
}

// TODO add space around << and operators

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

module.exports = {
  addSpaceAfterComma,
  removeSpacesAfterMethodName,
  removeSpacesBetweenBrackets,
  addNewlineAfterDollar,
  wrapComment,
};
