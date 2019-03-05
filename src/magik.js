'use strict';

const MagikVSCode = require('./magik-vscode');
const MagikLinter = require('./magik-linter');

function activate(context) {
  const magikVSCode = new MagikVSCode(context);
  new MagikLinter(magikVSCode, context); // eslint-disable-line
}

exports.activate = activate;
