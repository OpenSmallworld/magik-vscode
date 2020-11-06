'use strict';

const vscode = require('vscode'); // eslint-disable-line
const magikUtils = require('./magik-utils');

const VAR_MULTI_START_REG = /^\s*\((\s*(?=([\w!?]+))\s*,)*\s*((?=([\w!?]+)))*\s*$/;
const VAR_MULTI_MID_REG = /^(\s*(?=([\w!?]+))\s*,)*\s*((?=([\w!?]+)))*\s*$/;
const VAR_MULTI_END_REG = /^(\s*(?=([\w!?]+))\s*,)*\s*((?=([\w!?]+)))*\s*\)\s*<</;
const COMMENT_REG = /^\s*#/;

// TODO - refactor find variable functions

function findMultiAssignedVariables(lines, firstRow, lineCount, assignedVars) {
  const firstText = magikUtils.stringBeforeComment(lines[lineCount]);
  if (/<</.test(firstText) || !VAR_MULTI_START_REG.test(firstText))
    return false;

  const max = lines.length;
  let endCount;

  for (let i = lineCount + 1; i < max; i++) {
    const lineText = lines[i];
    const text = magikUtils.stringBeforeComment(lineText);

    if (VAR_MULTI_END_REG.test(text)) {
      endCount = i;
      break;
    }
    if (!COMMENT_REG.test(text) && !VAR_MULTI_MID_REG.test(text)) {
      break;
    }
  }

  if (endCount === undefined) return false;

  const lastText = lines[endCount];
  let annoClasses = [];
  let annoSplit = lastText.split('# @class');
  if (annoSplit.length < 2) {
    annoSplit = lastText.split('#@class');
  }
  if (annoSplit.length > 1) {
    annoClasses = annoSplit[1].split(',').map((type) => type.trim());
  }
  const annoLength = annoClasses.length;

  let varCount = 0;
  let match;

  // Find all variables
  for (let i = lineCount; i < endCount + 1; i++) {
    const row = i + firstRow;
    const text = magikUtils.stringBeforeComment(lines[i]);
    const testString = text.split('<<')[0];

    while (match = magikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
      const varName = match[0];
      const varIndex = match.index;
      const varData = assignedVars[varName];

      if (varData) {
        varData.row = row;
        varData.index = varIndex;
      } else {
        let className;
        if (varCount < annoLength) {
          className = annoClasses[varCount];
        }

        assignedVars[varName] = {
          row,
          index: varIndex,
          count: 1,
          dynamic: false,
          className,
        };
      }

      varCount++;
    }
  }

  return true;
}

function findAssignedVariables(lines, firstRow, lineCount, assignedVars) {
  if (findMultiAssignedVariables(lines, firstRow, lineCount, assignedVars)) {
    return;
  }

  const lineText = lines[lineCount];
  const text = magikUtils.stringBeforeComment(lineText);

  if (!/[\w!?]+\s*\)?\s*<</.test(text)) {
    return;
  }

  const assignSplit = text.split('<<');
  const assignSplitLength = assignSplit.length;
  if (assignSplitLength < 2) return;

  const row = lineCount + firstRow;
  const multiLine = /<<\s*$/.test(text);
  let lastText = lineText;
  if (multiLine) {
    const ignoreReg = /^\s*(#|$|([\w!?]+\s*<<\s*)+$)/;
    const max = lines.length;
    for (let i = lineCount + 1; i < max; i++) {
      const nextText = lines[i];
      if (!ignoreReg.test(nextText)) {
        lastText = nextText;
        break;
      }
    }
  }

  let annoClasses = [];
  let annoSplit = lastText.split('# @class');
  if (annoSplit.length < 2) {
    annoSplit = lastText.split('#@class');
  }
  if (annoSplit.length > 1) {
    annoClasses = annoSplit[1].split(',').map((type) => type.trim());
  }
  const annoLength = annoClasses.length;

  let varCount = 0;
  let match;

  for (let i = 0; i < assignSplitLength - 1; i++) {
    let testString = assignSplit[i].split('(').slice(-1)[0];
    let startIndex = text.indexOf(testString);
    testString = magikUtils.removeStrings(testString);

    if (!/]\s*$/.test(testString)) {
      while (match = magikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
        const varName = match[0];
        const varIndex = match.index;

        if (
          Number.isNaN(Number(varName)) &&
          testString[varIndex] !== '_' &&
          !magikUtils.VAR_IGNORE_PREV_CHARS.includes(
            testString[varIndex - 1]
          ) &&
          !magikUtils.ASSIGN_IGNORE_NEXT.test(
            testString.slice(varIndex + varName.length)
          )
        ) {
          const varData = assignedVars[varName];
          const index = text.indexOf(varName, startIndex);
          startIndex = index + 1;

          // TODO variable class could be redefined

          if (varData) {
            varData.row = row;
            varData.index = index;
          } else {
            const dynamic = /_dynamic\s+$/.test(text.substring(0, index));
            let className;

            if (varCount < annoLength) {
              className = annoClasses[varCount];
            } else if (multiLine && /^\s*[\w!?]+.new\s*\(/.test(lastText)) {
              className = lastText.split('.')[0].trimStart();
            } else if (
              /^\s*<<\s*[\w!?]+.new\s*\(/.test(
                text.slice(index + varName.length)
              )
            ) {
              className = magikUtils.nextWordInString(text, index);
            }

            assignedVars[varName] = {
              row,
              index,
              count: 1,
              dynamic,
              className,
            };
          }

          varCount++;
        }
      }
    }
  }
}

function findLocalVariables(
  lineText,
  row,
  assignedVars,
  classNames,
  classData,
  globals,
  diagnostics
) {
  const text = magikUtils.stringBeforeComment(lineText);
  let testString = magikUtils.removeStrings(text);
  testString = magikUtils.removeSymbolsWithPipes(testString);

  const showUndefined = classNames.length > 0; // Need class name and globals
  const defLength = magikUtils.DEFINE_KEYWORD_TESTS.length;

  let annoClasses = [];
  let annoSplit = lineText.split('# @class');
  if (annoSplit.length < 2) {
    annoSplit = lineText.split('#@class');
  }
  if (annoSplit.length > 1) {
    annoClasses = annoSplit[1].split(',').map((type) => type.trim());
  }
  const annoLength = annoClasses.length;

  let varCount = 0;
  let startIndex;
  let match;

  // TODO - loop scopes
  if (testString.includes('_for ') && testString.includes(' _over ')) {
    const overSplit = testString.split(' _over ');
    const iterTestString = overSplit[0].split('_for ').slice(-1)[0];
    startIndex = text.indexOf(iterTestString);

    while (match = magikUtils.VAR_TEST.exec(iterTestString)) { // eslint-disable-line
      const varName = match[0];
      const varIndex = text.indexOf(varName, startIndex);
      startIndex = varIndex + 1;

      assignedVars[varName] = {
        row,
        index: varIndex,
        count: 1,
      };
    }
  }

  startIndex = 0;

  while (match = magikUtils.VAR_TEST.exec(testString)) { // eslint-disable-line
    const varName = match[0];
    const varLength = varName.length;
    let varIndex = match.index;
    const defTestString = text.substring(0, varIndex);

    if (
      Number.isNaN(Number(varName)) &&
      testString[varIndex] !== '_' &&
      !magikUtils.VAR_IGNORE_PREV_CHARS.includes(testString[varIndex - 1])
    ) {
      const varData = assignedVars[varName];
      varIndex = text.indexOf(varName, startIndex);

      if (
        showUndefined &&
        !varData &&
        magikUtils.nextChar(testString, varIndex + varLength) !== '('
      ) {
        let def = false;

        for (let defIndex = 0; defIndex < defLength; defIndex++) {
          if (magikUtils.DEFINE_KEYWORD_TESTS[defIndex].test(defTestString)) {
            assignedVars[varName] = {
              row,
              index: varIndex,
              count: 1,
              global: defIndex === 1,
              dynamic: defIndex === 2,
            };
            if (varCount < annoLength) {
              assignedVars[varName].className = annoClasses[varCount];
            }
            def = true;
            break;
          }
        }

        if (!def && !classData[varName] && !globals.includes(varName)) {
          const range = new vscode.Range(
            row,
            varIndex,
            row,
            varIndex + varLength
          );
          const d = new vscode.Diagnostic(
            range,
            `'${varName}' is not defined.`,
            vscode.DiagnosticSeverity.Error
          );
          diagnostics.push(d);
        }
      }

      if (
        varData &&
        (varData.row !== row || varData.index !== varIndex) &&
        !magikUtils.IMPORT_TEST.test(text.substring(0, varIndex))
      ) {
        varData.count++;
      }

      varCount++;
    }

    startIndex = varIndex + varLength;
  }
}

function getVariables(
  lines,
  firstRow,
  classNames,
  classData,
  globals,
  diagnostics
) {
  const assignedVars = magikUtils.getMethodParams(lines, firstRow, true);
  const end = lines.length - 1;
  let search = false;

  for (let i = 0; i < end; i++) {
    const row = firstRow + i;
    const line = lines[i];
    const text = magikUtils.stringBeforeComment(line);

    if (search) {
      findAssignedVariables(lines, firstRow, i, assignedVars);
      findLocalVariables(
        line,
        row,
        assignedVars,
        classNames,
        classData,
        globals,
        diagnostics
      );
    } else if (
      /(\)|<<|\]|^<<)/.test(text) ||
      /(^|\s+)_method\s+.*[\w!?]$/.test(text)
    ) {
      search = true;
    }
  }

  return assignedVars;
}

function getMethodVariables(pos, classNames, classData, globals) {
  const region = magikUtils.currentRegion(false, pos.line);
  const {lines} = region;
  let vars = {};

  if (lines) {
    const {firstRow} = region;
    vars = getVariables(lines, firstRow, classNames, classData, globals, []);
  }

  return Object.keys(vars);
}

module.exports = {
  findAssignedVariables,
  findLocalVariables,
  getVariables,
  getMethodVariables,
};
