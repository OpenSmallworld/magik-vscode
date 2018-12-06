# Magik VSCode

Magik language extension for VS Code.

## Features

Adds the following features to VS Code:
* Magik Syntax highlighting
* Command `Magik Compile Method` (F7)
* Command `Magik Compile File`
* Command `Magik Compile Selection`
* Command `Magik Goto` (F3) to jump to the source of a method. Click on a method name and invoke the command to jump to source or display method candidates at the Magik prompt.
* Adds _ before Magik keywords

(Use Ctrl + Shift + P to list available commands and type Magik)

This is a minimal implementation to assist with editing, navigation and compiling - please add more!

## Installation

Add the extension to VS Code by cloning the repo to %USERPROFILE%\.vscode\extensions

I would recommend using these other extensions:
* Bracket Pair Colorizer 2
* Git Lens
* Git History
* vscode-icons


## Usage

1. Open a repository folder in VS Code (do this before opening a terminal)

2. Open a terminal in VS Code and start a magik session:
e.g. S:\SW519\2018-11-30\core\bin\x86\runalias -a S:\SW519\2018-11-30\cambridge_db\config\gis_aliases cambridge_db_open

3. Load the development procs:
Load the file vscode_dev.magik at the Magik prompt.
This will load the magik_tools module and utility procs supporting VS Code integration.

(vscode_dev.magik is supplied in this extension - I would recommend copying this to a convenient location to load after a session starts.)

The dev procs are then available at the Magik prompt.
For example:
* Open Class: oc("class name") - open a file in VS Code from the terminal.
* Method Find: mf("method name", "class name")


## Requirements

* Requires Magik to be running in the VS Code integrated terminal.
* Requires the utility procs to be loaded from vscode_dev.magik.


## Extension Settings


## Known Issues


## Release Notes


### 0.0.1

Initial release of magik-vscode with syntax highlighting and compiling magik.
