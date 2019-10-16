# Magik VSCode

Magik language extension for VS Code.

## Features

Adds the following features to VS Code:
* Compile Code Commands:
    * `Magik Compile Method` (**F7**) compile the current method or region (e.g. block or proc).
    * `Magik Compile File` (**Ctrl+F7**)
    * `Magik Load Module` (**Ctrl+Shift+F7**)
    * `Magik Compile Selection` (**F8**)
* Code Navigation Commands:
    * `Magik Goto` (**F3**) to jump to source.<br>
    Click on a method name and invoke the command to jump to source or display method candidates at the Magik prompt.
    * `Go to Definition` (**F12**) and `Peek Definition` (**Alt+F12**) in Magik.
    * `Find All References` (**Shift+F12**) and `List All References` (**Shift+Alt+F12**) in Magik.<br>
    (Only searches in the current file - use Find in Folder to expand a search)
* Code Formating:
    * Magik Syntax highlighting
    * Auto indenting of Magik code
    * Auto completion for Magik keywords, classes, variables, globals and methods.
    * Adds _ before Magik keywords
    * Snippets for common Magik definitions
    * Command `Magik Indent Region` (**Ctrl+I**)
    * Command `Magik Indent File` (**Ctrl+Shift+I**)
    * Command `Magik Indent Line` (**Alt+Enter**)
    * Command `Magik Format Region` (**Alt+F**) - format and indent current region
    * Command `Magik Format File` (**Shift+Alt+F**)
* Linting:
    * Command `Magik Check File` (**Ctrl+Shift+C**)

    The following errors/warnings are highlighted in the code:
    * Undefined variables
    * Unused variables
    * Undefined method usage
    * Use of a class name as a local variable
    * Private methods that are classified as Basic
    * Missing comment from a Basic method
    * (Hint) Complex methods with a cyclomatic complexity over 10
    * (Hint) Long methods with more than 40 lines of code
* Debugging:
    * Breakpoints and conditional breakpoints
    * Evaluate expressions at the Debug console
    * Debug actions Continue/Pause F5, Step Over F10, Step Into F11 and Step Out Shift+F11
    * Data inspection as you hover over source in the editor
* Symbols:
    * Search Magik methods in the current session (**Ctrl+T**)
    * Magik definitions in the current file to support Outline view
* Testing:
    * Command `Magik Run Test` to run the current test method (**Alt+F7**)
* Other:
    * Displays method help for indentified method calls.
    * Command `Magik New Buffer` to create a new Magik file in the temp directory (**Alt+N**)
    * Command `Magik Go To Previous Definition` (**Alt+PageUp**)
    * Command `Magik Go To Next Definition` (**Alt+PageDown**)
    * Command `Magik Select Region` (**Alt+R**)

(Use Ctrl+Shift+P to list available commands and type 'Magik')

### **Method Search**

You can search for Magik methods using **Ctrl+T** and typing `<method name>` or `<class name>`.`<method name>`.<br>
The search supports ^ and $ for starts and ends with.<br>
Use **Alt+T** to refresh symbols after compiling code.

### **Magik Linting**

Magik files are scanned when they are opened and saved or by using the command `Magik Check File` (**Ctrl+Shift+T**).

Warning: This does not confirm the code is without issues!

The linting can be enabled/diabled using the setting `magik-vscode.enableLinting`.

### **Magik Debugging**

The Magik session needs to be started with a Java option to tell the JVM to load the debug agent. For example from the command line this could be:

S:\SW522\2019-10-09\core\bin\x86\runalias **-j -agentpath:S:\SW522\2019-10-09\core\bin\x86\mda.dll** -a S:\SW522\2019-10-09\cambridge_db\config\gis_aliases cambridge_db_open

To start debugging in VS Code select Debug -> Start Debugging (**F5**) and select Magik from the list.<br>
The current threads should then be listed under Call Stack in the Debug View.<br>
Toggle breakpoints by selecting a line and pressing F9 or click to the left of a line number.

I suggest using relocate_products() to ensure local source files can be found during debugging.

Limitation: Compile (saved) files rather than methods during debugging to ensure the line numbers remain in step.

Warning: There are some performance issues with stepping!

## Installation

1. Add the extension to VS Code by cloning the repo to %USERPROFILE%\\.vscode\extensions
2. Run npm install inside the Magik extension (requires Node.js to be installed):

    cd %USERPROFILE%\\.vscode\extensions\magik-vscode<br>
    npm install
3. VS Code Settings:
    * Enable `Editor: Format on Type` in the VS Code settings to allow adding _ and auto indentation.
    * Add the command `magik.gotoClipboardText` to `Terminal > Integrated: Commands To Skip Shell`.
    * Enable `Terminal > Integrated: Copy On Selection` to allow jump to source from the terminal using **F3**.

I would recommend using these other extensions:
* Bracket Pair Colorizer 2
* Git Lens
* Git History

## Usage

1. Open a folder containing magik code in VS Code (**Note: Do this before opening a terminal**).

    e.g. The magik repo or C:\projects\hg

2. Open a terminal in VS Code and start a magik session.

    e.g.<br>
    S:\SW522\2019-10-09\core\bin\x86\runalias -a S:\SW522\2019-10-09\cambridge_db\config\gis_aliases cambridge_db_open<br>
    or for debugging<br>
    S:\SW522\2019-10-09\core\bin\x86\runalias -j -agentpath:S:\SW522\2019-10-09\core\bin\x86\mda.dll -a S:\SW522\2019-10-09\cambridge_db\config\gis_aliases cambridge_db_open

3. Load the file vscode_dev.magik at the Magik prompt (Use shortcut **Alt+M** (when the terminal doesn't have focus)).

    This will load a set of utility procs to support navigating and compiling Magik in VS Code.
    (vscode_dev.magik is supplied in this extension)


## Tips

* VS Code Settings:
    * Increase the default terminal buffer size by adding the following:
        ```json
        "terminal.integrated.scrollback": 20000
        ```
    * Set the text encoding to iso88591:
        ```json
        "files.encoding": "iso88591"
        ```
    * Add the following commands to `Terminal > Integrated: Commands To Skip Shell`:
        * `workbench.action.showAllSymbols`
        * `workbench.action.quickOpen`
        * `magik.gotoClipboardText`
        * `magik.refreshSymbols`
        * `magik.compileExtensionMagik`

* Dev Tools:
    * Load the dev_tools_application module in a development session:
        ```
        Magik> smallworld_product.add_product("C:\projects\hg\corerepo\sw_core\modules\sw_dev_tools")
	    Magik> sw_module_manager.load_module(:dev_tools_application)
        ```
        **Note:** vscode_dev.magik should be loaded after loading the dev tools as it overrides some helper procs.
    * Use relocate_products() (from the dev procs in magik_tools) to point the known products to local repositories.

        Jumping to source using F3 will then open code from the local repo.
        ```
        Magik> relocate_products()
        ```
        **Note:** Symbols should be refreshed using shortcut **Alt+T** (or vs_save_symbols()) after relocating products to update paths to source files.
* Other:
    * Load vscode_dev.magik in the .magik file in your home directory.
    * You can toggle between the editor and terminal using **Ctrl+'**
    * The module for the current Magik file can be loaded using the shortcut **Ctrl+Shift+F7**.<br>
    This will load (or reload) the module containing the file and adds products and loads prerequisite modules as necessary.<br>
    For example, this is useful for loading a test file or new module into the session.
    * You can jump to source from the terminal by selecting a method name (or class.method) and pressing **F3**. Requires the steps in 2. in the Installtion notes above.
    * Use Alt+Click to move the cursor in the terminal.
    * For a light theme and Bracket Pair Colorizer 2 use these colours in the settings:
        ```
        "bracket-pair-colorizer-2.colors": [
            "333333",
            "f57c00",
            "9c27b0"
        ]
        ```

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

* Maximum amount of characters per comment line (0 = disable) (80 by default)
    ```json
    "magik-vscode.wrapCommentLineLength": 80
    ```

* Enable auto scroll to the Magik prompt when sending commands to the terminal (`true` by default)
    ```json
    "magik-vscode.enableAutoScrollToPrompt": true
    ```

## Known Issues

* Magik symbols (to support searching for methods) are not loaded automatically after compiling code - use **Alt+T** to refresh symbols.
* No highlighting or formatting at the Magik prompt - I suggest creating a temp magik file for writing Magik (**Alt+N**).
* Linting only available inside methods.
* No status feedback when stepping in debug session.
* The debug session can get stuck and need to restart the magik session.

Current debug agent issues are listed here:
https://devcloud.swcoe.ge.com/devspace/pages/viewpage.action?spaceKey=SWV&title=How+to+Use+The+Magik+Debugger


Please add issues here:
https://github.build.ge.com/smallworld-sw5x/magik-vscode/issues

## Release Notes

### 0.0.6

* Added Magik Debug session

### 0.0.5

* Added auto completion for local variables.
* Allow compile region (method, proc or block) using F7.
* Fixed indenting for brackets.
* Added select region shortcut.
* Wrapping of comment lines
* Added command to load the current module.

### 0.0.4

Initial release to OpenSmallworld public GitHub

### 0.0.3

* Added linting for Magik files.
* Fixed indenting for procs and >>
* Refactored extension code.
* Added Magik Run Test.

### 0.0.2

Added snippets and symbol support for searching Magik methods.

### 0.0.1

Initial release of magik-vscode with syntax highlighting and compiling magik.
