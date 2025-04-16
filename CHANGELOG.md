# Change Log

All notable changes to the "magik" extension will be documented in this file.

## 0.2.6

* Updated project dependencies.

## 0.2.5

* Consolidate development tools from sw_dev_tools/magik_tools

## 0.2.4

- Updates and refactoring of README.md

## 0.2.3

- Improvements to snippets to support completion of Magik code.
- Added search class, peek definition and peek references to hover actions.
- Added automated tests for formating and linting.
- Improved go to definition of globals.
- Fixed definition ranges to show current method in breadcrumbs.
- Fixed reconnecting to the method finder.

## 0.2.2

- Magik Console Editor history is now persistent between VS Code sessions.
- Added Magik Darker and Magik Light themes.
- Fixed formatting error after pressing return.
- Added VS Code extension file for manual installs.

## 0.2.1

- Added class, global and parameter highlighting.
- Added Magik Console Editor auto complete for command history.
- Enabled class comments in Class Browser.
- Added Magik dark theme.
- Updated default code navigation shortcuts.
- Added config option to switch between searching with Class Browser or Method Search List.

## 0.2.0

- Added Class Browser panel

## 0.1.2

- Introduced Magik Console files for evaluating code and capturing terminal output.
- Updated code navigation shortcuts.
- Fixed starting a session with F2 z.
- Fixed extension hangs caused by some regexp tests.
- Added lock symbol for private methods and constants in the method search.

## 0.1.1

- Added links to source from tracebacks in the terminal.
- Added end statement keyword matching to auto complete.
- Added show method history to hover actions (requires dev_tools to be loaded).
- Fixed auto complete for variables and parameters.
- Fixed exact match search for classes and methods.

## 0.1.0

- Improved definition search (Ctrl+M) to show parameters and method comments.
- Go To Definition now shows a list of options in VS Code.
- The current Magik files is now checked for problems after compiling code.
- Fixed format errors with brackets, floating point exponent and negative numbers.

## 0.0.8

- Added hover actions to search, compile code and run tests.
- Updated symbol search to included exemplars, conditions and gloabls.
- Fixed load modules to load all prerequisites.
- Improved Go To Definition command.
- Added Smallworld Ninja game.

## 0.0.7

- Added support for Smallworld 4.x development
- Added Magik Start Session command (F2 z).
- Improved auto completion for methods to include variable and comment help.
- Improved formatting of Magik files.
- Fixed some issues with Magik Goto.
- Outline view can now show definitions defined over multiple lines.
- Symbols for method search are refreshed when compiling code using F7, Ctrl+F7 etc.
- Added rename variable support.

## 0.0.6

- Added Magik Debug session

## 0.0.5

- Added auto completion for local variables.
- Allow compile region (method, proc or block) using F7.
- Fixed indenting for brackets.
- Added select region shortcut.
- Wrapping of comment lines
- Added command to load the current module.

## 0.0.4

- Initial release to OpenSmallworld public GitHub

## 0.0.3

- Added linting for Magik files.
- Fixed indenting for procs and >>
- Refactored extension code.
- Added Magik Run Test.

## 0.0.2

- Added snippets and symbol support for searching Magik methods.

## 0.0.1

- Initial release of magik-vscode with syntax highlighting and compiling magik.
