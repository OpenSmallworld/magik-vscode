'use strict';

const vscode = require('vscode'); // eslint-disable-line
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE_CACHE_SIZE = 250;

class MagikFiles {
  constructor(context) {
    this.fileCache = [];

    context.subscriptions.push(vscode.commands.registerCommand(
      'magik.newBuffer',
      (args) => MagikFiles.newMagikBuffer(args)
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
      'magik.openFile',
      (args) => MagikFiles.openFile(args)
    ));
  }

  static getDocLines(doc) {
    const lines = [];
    const linesLength = doc.lineCount;
    for (let i = 0; i < linesLength; i++) {
      lines.push(doc.lineAt(i).text);
    }
    return lines;
  }

  static currentMagikFiles() {
    const fileNames = [];
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === 'magik') {
        fileNames.push(doc.fileName);
      }
    }
    return fileNames;
  }

  static getMagikFilesInDirectory(dir) {
    const magikFiles = [];
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      if (path.extname(file) === '.magik') {
        magikFiles.push(path.join(dir, file));
      }
    });
    return magikFiles;
  }

  static async newMagikBuffer(name, outputText, viewColumn) {
    const prefix = name === undefined ? 'buffer' : name;
    const dateStr = new Date().toLocaleDateString().replace(/(\\|\/)/g, '_');
    const fileName = `${prefix} ${dateStr}`;
    const tempDir = os.tmpdir();
    let tempFile = path.join(tempDir, `${fileName}.magik`);
    let count = 1;

    while (fs.existsSync(tempFile)) {
      tempFile = path.join(tempDir, `${fileName} (${count}).magik`);
      count++;
    }

    const str = outputText || '';

    fs.writeFileSync(tempFile, str);

    const lastRow = str.split('\n').length;
    const range = new vscode.Range(lastRow, 0, lastRow, 0);
    vscode.window.showTextDocument(vscode.Uri.file(tempFile), {
      selection: range,
      preview: false,
      viewColumn,
    });
  }

  static openFile(args) {
    if (args.fileName) {
      const workbenchConfig = vscode.workspace.getConfiguration('workbench');
      const preview = workbenchConfig.editor.enablePreviewFromCodeNavigation;
      const viewColumn = args.firstColumn ? vscode.ViewColumn.One : undefined;
      let selection;

      if (args.lineNumber !== undefined) {
        selection = new vscode.Range(args.lineNumber, 0, args.lineNumber, 0);
      }

      vscode.window.showTextDocument(vscode.Uri.file(args.fileName), {
        preview,
        viewColumn,
        selection,
      });
    }
  }

  // Update file cache after saving a file.
  updateFileCache(doc) {
    try {
      const fileName = doc.fileName;
      const cacheLength = this.fileCache.length;

      for (let index = 0; index < cacheLength; index++) {
        const data = this.fileCache[index];

        if (data[0] === fileName) {
          data[1] = MagikFiles.getDocLines(doc);
          break;
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  getFileLines(fileName) {
    if (!fileName || fileName === '') return;

    try {
      fs.accessSync(fileName, fs.constants.R_OK);
    } catch (err) {
      return;
    }

    let openDoc;

    for (const doc of vscode.workspace.textDocuments) {
      if (doc.fileName === fileName) {
        if (doc.isDirty) {
          // Use lines from unsaved editor
          return MagikFiles.getDocLines(doc);
        }
        openDoc = doc;
        break;
      }
    }

    const cacheLength = this.fileCache.length;

    for (let index = 0; index < cacheLength; index++) {
      const data = this.fileCache[index];

      if (data[0] === fileName) {
        if (index > Math.floor(FILE_CACHE_SIZE * 0.75) - 1) {
          this.fileCache.splice(index, 1);
          this.fileCache.unshift(data);
        }
        return data[1];
      }
    }

    let lines;
    if (openDoc) {
      lines = MagikFiles.getDocLines(openDoc);
    } else {
      try {
        lines = fs
          .readFileSync(fileName)
          .toString()
          .split('\n');
      } catch (err) {
        vscode.window.showWarningMessage(`Cannot open file: ${fileName}`);
        return;
      }
    }

    this.fileCache.unshift([fileName, lines]);

    if (cacheLength === FILE_CACHE_SIZE) {
      this.fileCache.pop();
    }

    return lines;
  }
}

module.exports = MagikFiles;
