'use strict';

const vscode = require('vscode'); // eslint-disable-line
const fs = require('fs');
const path = require('path');
const find = require('findit');

const IGNORE_DIRS = [
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'modules',
  'source',
  'src',
  'ds',
  'lib',
  'libs',
  'licences',
  'data',
];

class MagikSession {
  constructor(context) {
    this.homeDir = vscode.workspace.getConfiguration(
      'magik-vscode'
    ).smallworldHome;

    context.subscriptions.push(
      vscode.commands.registerCommand('magik.startSession', () =>
        this._startSession()
      )
    );

    if (
      vscode.workspace.getConfiguration('magik-vscode').magikProcessName === ''
    ) {
      context.subscriptions.push(
        vscode.commands.registerCommand('magik.startDebugSession', () =>
          this._startSession(true)
        )
      );
    }

    // Register custom command
    context.subscriptions.push(
      vscode.commands.registerCommand('magik.startCustomSession', () => this.showSessionPicker())
    );
  }

  _readAliasFile(fileName) {
    let lines;
    try {
      lines = fs
        .readFileSync(fileName)
        .toString()
        .split('\n');
    } catch (err) {
      return;
    }

    const nLines = lines.length;
    const newAliases = [];
    let lastData = {};

    for (let i = 0; i < nLines; i++) {
      const text = lines[i];
      const nameMatch = /^([\w]+):$/.exec(text);

      if (nameMatch) {
        lastData = {name: nameMatch[1]};
        newAliases.push(lastData);
      } else {
        const titleMatch = /^\s*title\s*=\s*(.*)/.exec(text);

        if (titleMatch) {
          lastData.description = titleMatch[1].trim();
        }
      }
    }

    this.allAliases[fileName] = newAliases;
  }

  _launchSession(target, debug) {
    const debugString = debug
      ? ` -j -agentpath:${path.dirname(this.runAlias)}/mda.dll`
      : '';
    const command = `${this.runAlias}${debugString} -a ${target.fileName} ${
      target.aliasName
    }\u000D`;

    vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
      text: command,
    });
  }

  async _selectAlias(debug) {
    if (this.runAlias === undefined) {
      vscode.window.showErrorMessage('runalias.exe not found in search path');
      return;
    }
    if (Object.keys(this.allAliases).length === 0) {
      vscode.window.showErrorMessage('No aliases found in search path');
      return;
    }

    const list = [];

    for (const [fileName, aliases] of Object.entries(this.allAliases)) {
      for (const data of aliases) {
        list.push({
          label: data.name,
          description: data.description || fileName,
          fileName,
          aliasName: data.name,
        });
      }
    }

    const target = await vscode.window.showQuickPick(list, {
      placeHolder: 'Please select a gis alias to start',
    });

    if (target) {
      this._launchSession(target, debug);
    }
  }

  async _selectFolder(defaultDir, searchString) {
    const defaultUri = defaultDir ? vscode.Uri.file(defaultDir) : undefined;

    const target = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      defaultUri,
      openLabel: searchString,
    });

    if (target) {
      let searchDir = target[0].path;
      if (searchDir.startsWith('/')) {
        searchDir = searchDir.substring(1);
      }
      return searchDir;
    }
  }

  async _findRunAlias(defaultDir, debug) {
    // Try and find core directory
    if (defaultDir && fs.existsSync(defaultDir)) {
      let tempDir = defaultDir;
      do {
        tempDir = path.dirname(tempDir);
        const testDir = path.join(tempDir, 'core');
        if (fs.existsSync(testDir)) {
          defaultDir = testDir;
          break;
        }
      } while (!/[/\\]$/.test(tempDir));
    }

    const searchDir = await this._selectFolder(
      defaultDir,
      'Search for runalias.exe'
    );

    if (searchDir && fs.existsSync(searchDir)) {
      const finder = find(searchDir);

      finder.on('directory', (dir, stat, stop) => {
        const base = path.basename(dir);
        if (IGNORE_DIRS.includes(base)) {
          stop();
        }
      });

      finder.on('file', (file) => {
        const base = path.basename(file);
        if (this.runAlias === undefined && base === 'runalias.exe') {
          this.runAlias = file;
        }
      });

      finder.on('end', () => {
        this._selectAlias(debug);
      });
    }
  }

  async _startSession(debug = false) {
    vscode.commands.executeCommand('workbench.action.terminal.focus', {});

    this.allAliases = {};
    this.runAlias = undefined;

    const searchDir = await this._selectFolder(
      this.homeDir,
      'Search for aliases'
    );

    if (searchDir && fs.existsSync(searchDir)) {
      const finder = find(searchDir);

      finder.on('directory', (dir, stat, stop) => {
        const base = path.basename(dir);
        const testFile = path.join(dir, 'gis_aliases');
        if (fs.existsSync(testFile)) {
          this._readAliasFile(testFile);
        }
        if (IGNORE_DIRS.includes(base)) {
          stop();
        }
      });

      finder.on('file', (file) => {
        const base = path.basename(file);
        if (base === 'gis_aliases') {
          this._readAliasFile(file);
        } else if (this.runAlias === undefined && base === 'runalias.exe') {
          this.runAlias = file;
        }
      });

      finder.on('end', () => {
        if (this.runAlias) {
          this._selectAlias(debug);
        } else {
          this._findRunAlias(searchDir, debug);
        }
      });
    }
  }

  // Methods for Custom Session
  async showSessionPicker() {
    const config = vscode.workspace.getConfiguration('Smallworld');
    const sessions = config.get('sessions') || [];

    if (sessions.length === 0) {
      vscode.window.showErrorMessage('No Smallworld sessions configured');
      return;
    }

    const sessionItems = sessions.map((session, index) => ({
      label: `${index + 1} ${session.session}`,
      description: '',
      session: session
    }));

    const selected = await vscode.window.showQuickPick(sessionItems, {
      placeHolder: 'Select Smallworld session to start'
    });

    if (selected) {
      this.startCustomSession(selected.session);
    }
  }

  async startCustomSession(sessionConfig) {
    try {
          // Get active terminal or create new one
      let terminal = vscode.window.activeTerminal;
      if (!terminal) {
        const terminalName = sessionConfig.session || 'Smallworld Session';
        terminal = vscode.window.createTerminal(terminalName);
      }
      terminal.show();

      if (sessionConfig.command) {
        let command = sessionConfig.command;
        command = command.replace(/(?<!\\)\\(?!\\)(\w)/g, '\\\\$1');
        command = command.replace(/^\\(?!\\)/, '\\\\');

        terminal.sendText(command);
      }

      if (sessionConfig.saveconfig) {
        await vscode.workspace.getConfiguration().update(
          'Smallworld.redialSession',
          sessionConfig,
          vscode.ConfigurationTarget.Global
        );
      }

    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start session: ${error.message}`);
    }
  }
}

module.exports = MagikSession;
