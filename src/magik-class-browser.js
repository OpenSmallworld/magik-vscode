'use strict';

const vscode = require('vscode'); // eslint-disable-line
const fs = require('fs');
const os = require('os');
const path = require('path');
const chokidar = require('chokidar');
const cp = require('child_process');

const CB_FILENAME = 'vscode_class_browser.txt';

class MagikClassBrowser {
  constructor(magikVSCode, context) {
    this.magikVSCode = magikVSCode;

    this._extensionUri = context.extensionUri;

    this._searchProperties = {
      className: '',
      methodName: '',
      local: false,
      args: false,
      comments: false,
    };

    this._childProcess = undefined;
    this._dataLines = undefined;

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('magik.classBrowser', this)
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('magik.classBrowser', () => {
        // Make CB webview visible and set focus in search input.
        if (this._view) {
          this._view.show(false);
          this._view.webview.postMessage({type: 'setFocus'});
        }
      })
    );

    this._initWatcher();
  }

  _initWatcher() {
    const fileDir = os.tmpdir();
    const cbFile = path.join(fileDir, CB_FILENAME);

    this._connectMessage = undefined;

    this._processFileWatcher = chokidar.watch(cbFile);
    this._processFileWatcher.on('add', () => {
      const lines = fs
        .readFileSync(cbFile)
        .toString()
        .split('\n');
      const data = {};

      for (const line of lines) {
        const parts = line.split('|');
        data[parts[0]] = parts[1];
      }

      fs.unlinkSync(cbFile);

      this._disconnect();
      this._initConnect(data);
    });
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case 'connect':
          this._connect();
          break;
        case 'search':
          this._search(message.className, message.methodName);
          break;
        case 'methodSelected':
          this._gotoMethod(message.className, message.methodName);
          break;
        case 'setProperty':
          this._searchProperties[message.name] = message.value;
          break;
        case 'ready':
          this._reconnect();
          break;
        default:
      }
    });

    webviewView.onDidDispose(() => {
      this._disconnect();
    });
  }

  _getHtmlForWebview(webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'class_browser', 'main.js')
    );

    // Do the same for the stylesheet.
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        'src',
        'class_browser',
        'reset.css'
      )
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        'src',
        'class_browser',
        'vscode.css'
      )
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        'src',
        'class_browser',
        'main.css'
      )
    );
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        'node_modules',
        'vscode-codicons',
        'dist',
        'codicon.css'
      )
    );
    const codiconsFontUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        'node_modules',
        'vscode-codicons',
        'dist',
        'codicon.ttf'
      )
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${codiconsFontUri}; style-src ${
      webview.cspSource
    } ${codiconsUri}; script-src 'nonce-${nonce}';"></meta>

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">

				<link href="${codiconsUri}" rel="stylesheet" />

				<title>Magik Class Browser</title>
			</head>
			<body>
				<div class="search-container">
          <input id="classInput" class="search-input" placeholder="Class name" disabled></input>
          <input id="methodInput" class="search-input" placeholder="Method name" disabled></input>
          <button id="localButton" class="info-button" disabled>Local</button>
          <button id="argsButton" class="info-button" disabled>Args</button>
          <button id= "commentsButton" class="info-button" disabled>Comments</button>
          <div class="connect-container"></div>
					  <button class="connect-button">Connect</button>
				  </div>
        </div>
        <div><span class="results-length"/>
        </div>
				<ul class="results-list">
				</ul>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }

  _processData(data) {
    const results = [];
    const lines = data.split('\n');
    const methodReg = /\s+IN\s+/;
    const totalReg = /(^|>)\d+$/;
    const commentReg = /^\s*##.*$/;
    let methodData;
    let resultsLength;

    if (this._dataLines) {
      const lastLine = this._dataLines[this._dataLines.length - 1];
      this._dataLines[this._dataLines.length - 1] = lastLine + lines.shift();
      Array.prototype.push.apply(this._dataLines, lines);
    } else {
      this._dataLines = lines;
    }

    if (!totalReg.test(lines[lines.length - 2])) {
      return;
    }

    const dataLines = this._dataLines;
    const linesLength = dataLines.length;

    for (let lineIndex = 0; lineIndex < linesLength; lineIndex++) {
      const line = dataLines[lineIndex];

      // console.log(line);

      if (totalReg.test(line)) {
        resultsLength = line;
        break;
      }

      if (methodReg.test(line)) {
        if (methodData) {
          results.push(methodData);
        }
        const methodParts = line.split(/\s+/);
        const classParts = methodParts[2].split(':');
        const topics = methodParts.slice(4);
        const infoParts = [];
        let level;
        let priv = false;
        let iterator = false;
        let subclass = false;
        let index;

        switch (methodParts[3]) {
          case 'B':
            level = 'Basic';
            break;
          case 'A':
            level = 'Adv';
            break;
          default:
            level = methodParts[3];
        }

        infoParts.push(level);

        index = topics.indexOf('private');
        if (index !== -1) {
          priv = true;
          topics.splice(index, 1);
          infoParts.push('Private');
        }
        index = topics.indexOf('iter');
        if (index !== -1) {
          iterator = true;
          topics.splice(index, 1);
          infoParts.push('Iter');
        }
        index = topics.indexOf('S');
        if (index !== -1) {
          subclass = true;
          topics.splice(index, 1);
          infoParts.push('Subclass');
        }

        const infoString = infoParts.join('\u2002\u2004');

        methodData = {
          package: classParts[0],
          methodName: methodParts[0],
          className: classParts[1],
          infoString,
          level,
          topics,
          priv,
          iterator,
          subclass,
          commentLines: [],
        };
      } else if (methodData && line.length > 0) {
        if (
          this._searchProperties.args &&
          methodData.argsString === undefined &&
          methodData.commentLines.length === 0 &&
          !commentReg.test(line)
        ) {
          methodData.argsString = line;
        } else {
          methodData.commentLines.push(line);
        }
      }
    }
    if (methodData) {
      results.push(methodData);
    }

    this._dataLines = undefined;

    this._view.webview.postMessage({
      type: 'updateResults',
      results,
      resultsLength,
    });
  }

  _resetBrowser() {
    this._view.webview.postMessage({type: 'enableSearch', enabled: false});
    this._view.webview.postMessage({type: 'clearResults'});
    this._childProcess = undefined;
    this._dataLines = undefined;
  }

  _disconnect() {
    if (this._childProcess) {
      this._childProcess.kill();
      this._resetBrowser();
    }
  }

  _initConnect(data) {
    const id = data.processId;
    const gisDirectory = data.gisDirectory.replace(/[\/\\]/g, '\\');
    const command = `${gisDirectory}\\etc\\x86\\mf_connector.exe -m \\\\.\\pipe\\method_finder\\${id}`;

    this._childProcess = cp.exec(
      command,
      {stdio: 'pipe', maxBuffer: 10 * 1024 * 1024},
      (err, stout, sterr) => {
        if (err) {
          vscode.window.showWarningMessage(
            `Cannot connect to method finder:\n${err.message}`
          );
        }
      }
    );

    this._childProcess.stdout.on('data', (newData) => {
      this._processData(newData);
    });

    this._childProcess.on('close', () => {
      this._resetBrowser();
    });

    this._view.webview.postMessage({type: 'enableSearch', enabled: true});

    if (this._connectMessage) {
      this._view.webview.postMessage(this._connectMessage);
      this._connectMessage = undefined;
    }
  }

  _connect(message) {
    this._disconnect();
    this._connectMessage = message;
    this.magikVSCode.magikConsole.sendCommandToTerminal('vs_class_browser');
  }

  _reconnect() {
    if (this._childProcess) {
      this._connect({
        type: 'search',
        ...this._searchProperties,
      });
    }
  }

  _getMaxResults() {
    let maxResults = vscode.workspace.getConfiguration('magik-vscode')
      .maxClassBrowserResults;
    if (maxResults < 0) {
      maxResults = 1;
    } else if (maxResults > 20000) {
      maxResults = 20000;
    }
    return maxResults;
  }

  _search(className = '', methodName = '') {
    if (this._childProcess === undefined) {
      return;
    }

    this._searchProperties.className = className;
    this._searchProperties.methodName = methodName;

    const maxResults = this._getMaxResults();

    const strings = [
      'unadd class',
      `add class ${className}`,
      `method_name ${methodName}`,
      this._searchProperties.args ? 'show_args' : 'dont_show_args',
      this._searchProperties.comments ? 'show_comments' : 'dont_show_comments',
      'show_topics',
      'override_flags',
      'override_topics',
      this._searchProperties.local ? 'local_only' : 'inherit_all',
      'add deprecated',
      `method_cut_off ${maxResults}`,
      'print_curr_methods\n',
    ];

    this._view.webview.postMessage({type: 'clearResults'});

    this._dataLines = undefined;

    this._childProcess.stdin.write(strings.join('\n'));
  }

  async _gotoMethod(className, methodName) {
    // FIXME - find source from method finder
    let query;
    let command;
    if (className) {
      query = `^${className}$.^${methodName}$`;
      command = `vs_goto("^${methodName}$", "^${className}$")`;
    } else {
      query = `^${methodName}$`;
      command = `vs_goto("^${methodName}$")`;
    }
    await this.magikVSCode.gotoFromQuery(query, command, false, true);
  }
}

function getNonce() {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

module.exports = MagikClassBrowser;
