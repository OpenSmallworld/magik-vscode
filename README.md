# Magik VSCode

Magik language extension for VS Code. Supports Magik development in Smallworld 4.x and 5.x

## Features

Adds the following features to VS Code:

* Smallworld Session:
    * `Magik Start Session` (**F2 z**)
    * `Magik Start Debug Session`

* Compile Code Commands:
    * `Magik Compile Method` (**F7**) compile the current method or region (e.g. block or proc).
    * `Magik Compile File` (**Ctrl+F7**)
    * `Magik Load Module` (**Ctrl+Shift+F7**)
    * `Magik Compile Selection` (**F8**)
    * `Magik Compile Module Messages` (**F7**) compile messages for the current module (from a message file)

* Code Navigation:
    * `Magik Goto` (**F3** or **Alt+.**) to jump to source.<br>
    Click on a method name and invoke the command to jump to source or display method candidates at the Magik prompt.
    * Links to source from tracebacks in the terminal.
    * `Go to Definition` (**F12**) and `Peek Definition` (**Alt+F12**) in Magik.
    * `Find All References` (**Shift+F12** or **Ctrl+.**) and `List All References` (**Shift+Alt+F12**) in Magik.<br>
    (Only searches in the current folder - use Find in Folder to expand a search)

* Code Formating:
    * Magik Syntax highlighting
    * Auto indenting of Magik code
    * Auto completion for Magik keywords, classes, variables, globals and methods.
    * Adds underscore before Magik keywords
    * Snippets for common Magik definitions
    * Removes extra spaces between brackets
    * Adds spaces around operators
    * Command `Magik Indent To Line` (**Alt+Enter**) - indent region to current line
    * Command `Magik Indent Region` (**Ctrl+I**)
    * Command `Magik Indent File` (**Ctrl+Shift+I**)
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
    * Incorrect number of variables supplied for (identified) method calls

* Debugging:
    * Breakpoints and conditional breakpoints
    * Evaluate expressions at the Debug console
    * Debug actions Continue/Pause F5, Step Over F10, Step Into F11 and Step Out Shift+F11
    * Data inspection as you hover over source in the editor

* Search:
    * Search Magik methods, exemplars, conditions and globals in the current session (**Ctrl+M**)
    * Magik definitions in the current file to support Outline view

* Magik Console File:

    A Magik Console file can be used to evalutate code and display results like the Magik terminal, but with the behaviour of a Magik editor (e.g. syntax highlighting, formatting and auto complete).
    * Create a new console file (**Alt+E**)
    * Evaluate the current region (**F7**)
    * Show the previous command (**Alt+PageUp** or **Alt+[**)
    * Show the next command (**Alt+PageDown** or **Alt+]**)

* Testing:
    * Command `Magik Run Test` to run the current test method (**Alt+F7**)
    * Command `Magik Run Test Class` to run the current test class (**Ctrl+Alt+F7**)

* Other:
    * Display hover actions for the current word or selection.
        - Search - allows a quick search in the folder, module, product, repo or workspace (if found)
        - Search Definitions
        - Go To Definition
        - Run Test (available if the cursor points to a test method name and the code is loaded)
    * Displays method help for indentified method calls.
    * Command `Magik New Buffer` to create a new Magik file in the temp directory (**Alt+N**)
    * Command `Magik New Console` to create a new Magik console file in the temp directory (**Alt+E**)
    * Command `Magik Go To Previous Definition` (**Alt+PageUp** or **Alt+[**)
    * Command `Magik Go To Next Definition` (**Alt+PageDown** or **Alt+[**)
    * Command `Magik Select Region` (**Alt+R**)

(Use Ctrl+Shift+P to list available commands and type 'Magik')

<br>

### **Method Search**

You can search for Magik methods using **Ctrl+M** and typing `<method name>` or `<class name>`.`<method name>`.<br>
The search supports ^ and $ for starts and ends with.<br>
e.g. `add_comp` or `map_.goto_` or `^gui_frame.^activ`<br><br>
Use **Alt+M** to refresh definitions after compiling code from the prompt, scripts or module dialog.<br>
Definitions are refreshed after using **F7**, **Ctrl+F7** etc.

<br>

### **Magik Linting**

Magik files are scanned when they are opened and saved or by using the command `Magik Check File` (**Ctrl+Shift+T**).

Warning: This does not confirm the code is without issues!

The linting can be enabled/diabled using the setting `magik-vscode.enableLinting`.

<br>

### **Magik Debugging (5.x)**

The Magik session needs to be started with a Java option to tell the JVM to load the debug agent. For example from the command line this could be:

S:\SW522\2019-10-09\core\bin\x86\runalias **-j -agentpath:S:\SW522\2019-10-09\core\bin\x86\mda.dll** -a S:\SW522\2019-10-09\cambridge_db\config\gis_aliases cambridge_db_open

To start debugging in VS Code select Debug -> Start Debugging (**F5**) and select Magik from the list.<br>
The current threads should then be listed under Call Stack in the Debug View.<br>
Toggle breakpoints by selecting a line and pressing F9 or click to the left of a line number.

I suggest using `relocate_products()` to ensure local source files can be found during debugging.

Limitation: Compile (saved) files rather than methods during debugging to ensure the line numbers remain in step.

Warning: There are some performance issues with stepping!

<br>

### **Magik Console File**

A Magik Console file is a Magik file named console*.magik. A Magik Console file can be used to evalutate code and display results like the Magik terminal, but with the behaviour of a Magik editor.<br>
A console file can be created (in the temp directory) using **Alt+E**.<br>
The current region can be evaluated by pressing **F7** and the results are displayed in the file.<br>
The console supports command history. Use **Alt+PageUp** or **Alt+[** to show the previous command and **Alt+PageDown** or **Alt+]** to show the next command.

Standard output (e.g. tracebacks and write statements) will be shown in the console file if `magik-vscode.enableOutputToConsoleFile` is set to true.

Closing all console files will stop standard output being captured and revert behaviour back to the terminal.

Limitations: The console file does not currently support waiting for a response (where !terminal!.get_line() is used).<br>
Capturing output is not automatically restarted if a new session is started with an existing console file. The workaround is to save the console file or create a new one.

Warning: Capturing output in the console file is an experimental feature.

Capturing output is controlled by the setting `magik-vscode.enableOutputToConsoleFile` and is disabled by default.

<br>

## Installation

1. Add the extension to VS Code by cloning the repo to %USERPROFILE%\\.vscode\extensions
2. Run npm install inside the Magik extension (requires Node.js to be installed):

    cd %USERPROFILE%\\.vscode\extensions\magik-vscode<br>
    npm install

3. VS Code Settings:
    * Enable `Editor: Format on Type` in the VS Code settings to allow adding _ and auto indentation.
    * Add the command `magik.gotoClipboardText` to `Terminal > Integrated: Commands To Skip Shell`.
    * Enable `Terminal > Integrated: Copy On Selection` to allow jump to source from the terminal using **F3**.

4. Restart VS Code if it is already running.

<br>

Note: A npm update is required to update the dependencies after updating this extension.

I would recommend using these other extensions:
* Bracket Pair Colorizer 2
* Git Lens
* vscode-icons

## Usage

1. Open a folder containing Magik code in VS Code (**Note: Do this before opening a terminal**).

    e.g. A Magik repo or C:\projects\hg

2. Start a Magik session:

    * Option 1:
        Open a terminal in VS Code and use a runalias command
        e.g.<br>
        ```
        S:\SW522\2019-10-09\core\bin\x86\runalias -a S:\SW522\2019-10-09\cambridge_db\config\gis_aliases cambridge_db_open
        ```
        or for debugging<br>
        ```
        S:\SW522\2019-10-09\core\bin\x86\runalias -j -agentpath:S:\SW522\2019-10-09\core\bin\x86\mda.dll -a S:\SW522\2019-10-09\cambridge_db\config\gis_aliases cambridge_db_open
        ```

    * Option 2:
        Use `Magik Start Session` (**F2 z**) or `Magik Start Debug Session`
        1. Select a folder to search for aliases
        2. Select a folder to search for runalias.exe
        3. Select an alias from the list to start


    For a Smallworld 4.x development, set the property `magik-vscode.magikProcessName`. Use the process id if running more than one session.

    ```json
    "magik-vscode.magikProcessName: "sw_magik_win32.exe"
    ```

3. Load the file vscode_dev.magik at the Magik prompt (Use shortcut **Alt+M** - this will load the file and refresh definitions).

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
        * `magik.searchSymbols`

* Code Navigation:

    Use the arrow keys, **Ctrl+Left** and **Ctrl+Right** and the shortcuts below for simple code navigation.
    * **Alt+[** and **Alt+]** to move to the previous and next definition in a magik file.
    * **Alt+Left** and **Alt+Right** to go back and forward through the navigation history.
    * **Alt+.** to jump to the definition of the current word (or list suggestions).
    * **Ctrl+.** to peek at the definition and references in the current folder.

* Dev Tools:
    * Load the dev_tools_application module in a development session:
        ```
        Magik> smallworld_product.add_product("C:\projects\hg\corerepo\sw_core\modules\sw_dev_tools")
	    Magik> sw_module_manager.load_module(:dev_tools_application)
        ```
        **Note:** vscode_dev.magik should be loaded after loading the dev tools as it overrides some helper procs.
    * (Smallworld 5.x) Use `relocate_products()` (from the dev procs in magik_tools) to point the known products to local repositories.<br>
        This will use the source paths defined in the global USER_REPOSITORY_PATHS - please update this global or USER_PRODUCTS_ROOT to suite your development environment. This could be added to your .magik file in your home directory.

        Jumping to source using F3 will then open code from the local repo.
        ```
        Magik> relocate_products()
        ```
        **Note:** Definitions should be refreshed using shortcut **Alt+M** (or vs_save_symbols()) after relocating products to update paths to source files.

* Other:
    * Load vscode_dev.magik in the .magik file in your home directory.
    * You can toggle between the editor and terminal using **Ctrl+'**
    * The module for the current Magik file can be loaded using the shortcut **Ctrl+Shift+F7**.<br>
    This will load (or reload) the module containing the file and adds products and loads prerequisite modules as necessary.<br>
    For example, this is useful for loading a test file or new module into the session.
    * You can jump to source from the terminal by selecting a method name (or class.method) and pressing **F3**. Requires the steps in 2. in the Installation notes above.
    * Use Alt+Click to move the cursor in the terminal.
    * For a light theme and Bracket Pair Colorizer 2 use these colours in the settings:
        ```
        "bracket-pair-colorizer-2.colors": [
            "333333",
            "f57c00",
            "9c27b0"
        ],
        ```
    * To add an icon for Magik files with vscode-icons add the following to the settings (adding your user name):
        ```
        "vsicons.customIconFolderPath": "C:/Users/<user_name>/.vscode/extensions/magik-vscode/icons/",
        "vsicons.associations.files": [
            { "icon": "magik", "extensions": ["magik"], "format": "png" }
        ],
        ```

## Requirements

* Requires Magik to be running in the VS Code integrated terminal (for Smallworld 5.x).
* Requires the utility procs to be loaded from vscode_dev.magik.
* VS Code must be included in your Path (e.g. 'C:\Program Files\Microsoft VS Code\bin').
* Need Node.js to install in the extension dependencies.


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

* Enable Magik actions in hover tooltip (Search, Go To, Run Test...).
    ```json
    "magik-vscode.enableHoverActions": true
    ```

* Enable auto scroll to the Magik prompt when sending commands to the terminal (`true` by default)
    ```json
    "magik-vscode.enableAutoScrollToPrompt": true
    ```

* Magik Debug Client URL e.g. 'localhost:4123'
    ```json
    "magik-vscode.debugClientURL": ""
    ```

* Name or ID of the process running a Smallworld 4.x session e.g. 'sw_magik_win32.exe'. Leave empty for Smallworld 5 development.
    ```json
    "magik-vscode.magikProcessName: ""
    ```

* Defines the default path to search for gis_aliases and runalias.exe to start a session.
    ```json
    "magik-vscode.smallworldHome: ""
    ```

* Enable capturing Magik terminal output to a Magik console file (`false` by default)
    ```json
    "magik-vscode.enableOutputToConsoleFile"
    ```

## Known Issues

* Magik definition symbols (to support searching for methods, exemplars, conditions and globals) are only loaded automatically when compiling code using VS Code Magik commands (for SW5).<br>
Use **Alt+M** to refresh definitions manually after compiling code from the prompt, scripts, module dialog or using SW4.
* No highlighting or formatting at the terminal - I suggest using a Magik Console File (**Alt+E**) or creating a temporary magik file for writing Magik (**Alt+N**) and compile using **F7** or **F8**.
* Capturing output to a Magik Console File is not automatically restarted if a new session is started with an existing console file. The workaround is to save the console file or create a new one.
* Capturing output to a Magik Console File will not work with Magik sessions running in mulitple VS Code windows.
* Linting only available inside methods.
* No status feedback when stepping in debug session.
* The debugger can get stuck and hang the session. Sometimes pressing Pause on the thread allows you to regain control.<br>
Apologies if you need to restart your Magik session.

Current debug agent issues are listed here:
https://devcloud.swcoe.ge.com/devspace/pages/viewpage.action?spaceKey=SWV&title=How+to+Use+The+Magik+Debugger


Please add issues here:
https://github.build.ge.com/smallworld-sw5x/magik-vscode/issues

## Release Notes

### 0.1.2

* Introduced Magik Console files for evaluating code and capturing terminal output.
* Updated code navigation shortcuts.
* Fixed starting a session with F2 z.
* Fixed extension hangs caused by some regexp tests.
* Added lock symbol for private methods and constants in the method search.

### 0.1.1

* Added links to source from tracebacks in the terminal.
* Added end statement keyword matching to auto complete.
* Added show method history to hover actions (requires dev_tools to be loaded).
* Fixed auto complete for variables and parameters.
* Fixed exact match search for classes and methods.

### 0.1.0

* Improved definition search (Ctrl+M) to show parameters and method comments.
* Go To Definition now shows a list of options in VS Code.
* The current Magik files is now checked for problems after compiling code.
* Fixed format errors with brackets, floating point exponent and negative numbers.

### 0.0.8

* Added hover actions to search, compile code and run tests.
* Updated symbol search to included exemplars, conditions and gloabls.
* Fixed load modules to load all prerequisites.
* Improved Go To Definition command.
* Added Smallworld Ninja game.

### 0.0.7

* Added support for Smallworld 4.x development
* Added Magik Start Session command (F2 z).
* Improved auto completion for methods to include variable and comment help.
* Improved formatting of Magik files.
* Fixed some issues with Magik Goto.
* Outline view can now show definitions defined over multiple lines.
* Symbols for method search are refreshed when compiling code using F7, Ctrl+F7 etc.
* Added rename variable support.

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
