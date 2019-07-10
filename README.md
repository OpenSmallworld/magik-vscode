# Magik VSCode

Magik language extension for VS Code.

## Features

Adds the following features to VS Code:
* Compile Code Commands:
    * `Magik Compile Method` (**F7**)
    * `Magik Compile File` (**Ctrl+F7**)
    * `Magik Compile Selection` (**F8**)
* Code Navigation Commands:
    * `Magik Goto` (**F3**) to jump to source. Click on a method name and invoke the command to jump to source or display method candidates at the Magik prompt.
    * `Go to Definition` (**F12**) and `Peek Definition` (**Alt+F12**) in Magik.
    * `Find All References` (**Shift+F12**) and `List All References` (**Shift+Alt+F12**) in Magik. (Only searches in the current file - use Find in Folder to expand a search)
* Code Formating:
    * Magik Syntax highlighting
    * Auto indenting of Magik code
    * Auto completion for Magik keywords, classes, globals and methods.
    * Adds _ before Magik keywords
    * Snippets for common Magik definitions
    * Command `Magik Indent Region` (**Ctrl+I**)
    * Command `Magik Indent File` (**Ctrl+Shift+I**)
    * Command `Magik Format Region` (**Alt+F**)
    * Command `Magik Format File` (**Shift+Alt+F**)
* Linting:
    * Command `Magik Check File` (**Ctrl+Shift+F7**)

    The following errors/warnings are highlighted in the code:
    * Undefined variables
    * Unused variables
    * Undefined method usage
    * Use of a class name as a local variable
    * Private methods that are classified as Basic
    * Missing comment from a Basic method
    * (Hint) Complex methods with a cyclomatic complexity over 10
    * (Hint) Long methods with more than 40 lines of code
* Symbols:
    * Search Magik methods in the current session (**Ctrl+T**)
    * Magik definitions in the current file to support Outline view
* Testing:
    * Command `Magik Run Test` to run the current test method (**Alt+F7**)
* Other:
    * Displays method help for indentified method calls.
    * Command `Magik New Buffer` to create a new Magik file in the temp directory (**Alt+N**)

(Use Ctrl+Shift+P to list available commands and type Magik)

### **Method Search**

You can search for Magik methods using **Ctrl+T** and typing `<method name>` or `<class name>`.`<method name>`.
Use **Alt+T** to refresh symbols.

### **Magik Linting**

Magik files are scanned when they are opened and saved or by using the command `Magik Check File`.
Warning: This does not confirm the code is without issues!

The linting can be enable/diabled using the setting `magik-vscode.enableLinting`.

## Installation

1. Add the extension to VS Code by cloning the repo to %USERPROFILE%\\.vscode\extensions
2. Enable `Editor: Format on Type` in the VS Code settings to allow adding _ and auto indentation.

I would recommend using these other extensions:
* Bracket Pair Colorizer 2
* Git Lens
* Git History

## Usage

1. Open a folder containing magik code in VS Code (**Note: Do this before opening a terminal**).

    e.g. The magik repo or C:\projects\hg

2. Open a terminal in VS Code and start a magik session.

    e.g. S:\SW519\2018-11-30\core\bin\x86\runalias -a S:\SW519\2018-11-30\cambridge_db\config\gis_aliases cambridge_db_open

3. Load the file vscode_dev.magik at the Magik prompt (**Alt+M**).

    This will load a set of utility procs to support navigating and compiling Magik in VS Code.
    (vscode_dev.magik is supplied in this extension - I would recommend copying this to a convenient location to load after a session starts or load in .magik)
    The dev procs mfind() (aka mf()) and open_class() (aka oc()) will then be available at the Magik prompt.

## Requirements

* Requires Magik to be running in the VS Code integrated terminal.
* Requires the utility procs to be loaded from vscode_dev.magik.
* VS Code must be included in your Path (e.g. 'C:\Program Files\Microsoft VS Code\bin').


## Extension Settings

* Enable auto indentation of Magik code (`true` by default)
```json
    "magik-vscode.enableAutoIndentation": true
```

* Enable linting of Magik code (`true` by default)
```json
    "magik-vscode.enableLinting": true
```

## Known Issues

* Magik symbols (to support searching for methods) are not loaded automatically after compiling code - use **Alt+T** to refresh symbols.
* No highlighting or formatting at the Magik prompt - I suggest creating a temp magik file for writing Magik (**Alt+N**).
* Linting only available inside methods.

Please add issues here:
https://github.build.ge.com/smallworld-sw5x/magik-vscode/issues

## Release Notes

### 0.0.4

Initial release to OpenSmallworld public GitHub

### 0.0.3

* Added linting for Magik files.
* Fixed indenting for procs and >>
* Refactored extension code.
* Added Magik Run Test.

### 0.0.2

Added snippets and symbol support for Magik methods.

### 0.0.1

Initial release of magik-vscode with syntax highlighting and compiling magik.
