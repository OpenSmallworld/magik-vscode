# Magik VSCode

Magik language extension for VS Code.

## Features

Adds the following features to VS Code:
* Magik Syntax highlighting
* Command `Magik Compile Method` (F7)
* Command `Magik Compile File` (Ctrl+F7)
* Command `Magik Compile Selection` (F8)
* Command `Magik Goto` (F3) to jump to source. Click on a method name and invoke the command to jump to source or display method candidates at the Magik prompt.
* Command `Magik Indent Method`
* Adds _ before Magik keywords
* Auto indenting of Magik code
* Supports `Go to Definition` (F12) and `Peek Definition` (Alt+F12) in Magik. (Only searches in the current folder and open editors - use F3 to search all compiled code)
* Supports `Find All References` (Shift+F12) and `List All References` (Shift+Alt+F12) in Magik. (Only searches in the current file - use Find in Folder to expand a search)

(Use Ctrl + Shift + P to list available commands and type Magik)

This is a minimal implementation to assist with editing, navigation and compiling - please add more!

## Installation

1. Add the extension to VS Code by cloning the repo to %USERPROFILE%\.vscode\extensions

I would recommend using these other extensions:
* Bracket Pair Colorizer 2
* Git Lens
* Git History
* vscode-icons

2. Enable `Editor: Format on Type` in the VS Code settings to allow adding _ and auto indentation.


## Usage

1. Open a folder containing magik code in VS Code (**Note: Do this before opening a terminal**)

2. Open a terminal in VS Code and start a magik session:
e.g. S:\SW519\2018-11-30\core\bin\x86\runalias -a S:\SW519\2018-11-30\cambridge_db\config\gis_aliases cambridge_db_open

3. Load the development procs:
Load the file vscode_dev.magik at the Magik prompt.
This will load a set of utility procs to support navigating and compiling Magik in VS Code.

(vscode_dev.magik is supplied in this extension - I would recommend copying this to a convenient location to load after a session starts or load in .magik)

The dev procs mfind() (aka mf()) and open_class() (aka oc()) will then be available at the Magik prompt.


## Requirements

* Requires Magik to be running in the VS Code integrated terminal.
* Requires the utility procs to be loaded from vscode_dev.magik.


## Extension Settings

* Enable auto indentation of Magik code (`true` by default)
```json
    "magik-vscode.enableAutoIndentation": true
```

## Known Issues

* Auto complete for keywords (without existing in current file)
* No Magik snippets

Please add issues here:
https://github.build.ge.com/smallworld-sw5x/magik-vscode/issues

## Release Notes


### 0.0.1

Initial release of magik-vscode with syntax highlighting and compiling magik.
