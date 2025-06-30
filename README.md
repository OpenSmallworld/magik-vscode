# Magik for Visual Studio Code

The [VS Code Magik extension](https://marketplace.visualstudio.com/items?itemName=ge-smallworld.magik-vscode) provides rich support for the Magik programming language used in the GE Vernova Smallworld Geo Network Management (GNM) platform.

## Requirements

* Smallworld version 4 or 5
* Visual Studio Code 1.75 or newer (or editors compatible with VS Code 1.75+ APIs)

## Quick Start

Welcome to the world of Magik programming for Smallworld GNM!

Whether you are new to Magik or a long time veteran, you will find features of this extension that can improve your development experience.

Here is the quickest way to get started Programming Magik.

1. Install the version of [Smallworld GNM (formerly Smallworld)](https://www.ge.com/digital/applications/smallworld-gis-geospatial-asset-management) that corresponds to your needs (including Smallworld GNM components and custom code).
2. Install the [VS Code Magik extension](https://marketplace.visualstudio.com/items?itemName=ge-smallworld.magik-vscode).
3. Start a Smallworld session by typing the sequence `<F2>` then `Z` and follow the instructions to start the session (to start a _product_ session) or
   start your custom session from the command line of a terminal using the _runalias.exe_ application (typically found in _core\bin\x86_ of your Smallworld installation).  See the topic [Launcher program](https://smallworld-gnm.gevernova.com/documentation/sw53/en/swDocs5.htm#../Subsystems/Core/Content/Sessions/LauncherProgram.htm?TocPath=Technology%2520platform%257CCore%257CMagik%2520sessions%257C_____5) on the Smallworld GNM documentation website for more details.
4. Once the session has started, while a Magik code file editor has the focus, type `<CTRL>+<ALT>+M` to initialize the interface with the running Magik session.

![magik-vscode](./docs/images/basic_screenshot.png)

### ✨ New: Flexible Session Launching with Custom Configurations

In addition to the standard methods, this extension now offers a powerful way to launch project-specific sessions using a custom configuration. This is ideal for developers managing multiple environments.

1.  **Configure your sessions:** Add a `Smallworld.sessions` array to your `settings.json` file. Define a name and the full command for each session you need.

     ```json
    "Smallworld.sessions": [
      {
        "session": "My Project 01",
        "command": "C:\\<SW-CORE-BIN>\\bin\\x86\\runalias.exe -a C:\\<PROJECT-DIR>\\gis_aliases -e C:\\<PROJECT-DIR>\\environment.bat eo_open",
        "saveconfig": true
      },
      {
        "session": "My Project 02",
        "command": "C:\\<SW-CORE-BIN>\\bin\\x86\\runalias.exe -a C:\\<PROJECT-DIR>\\gis_aliases -e C:\\<PROJECT-DIR>\\environment.bat eo_open",
        "saveconfig": false
      },
      {
         ...
      },
      {
        "session": "My Project N",
        "command": "C:\\<SW-CORE-BIN>\\bin\\x86\\runalias.exe -a C:\\<PROJECT-DIR>\\gis_aliases -e C:\\<PROJECT-DIR>\\environment.bat alias",
        "saveconfig": false
      }
    ]
    ```

2.  **Launch with the session picker:** Press the key sequence `<F2>` `<F2>` then `Z`. A dropdown will appear, allowing you to select and launch any of your configured sessions instantly.

![magik-vscode](./docs/images/smallworld_session_selector.png)

## What's Next

Once you are able to start a Magik session and associate the session with your editor, you are ready to start programming Magik.  If you are new to programming Magik in Smallworld GNM, go over to the [Application Development section](https://smallworld.gedigitalenergy.com/documentation/sw53/en/swDocs5.htm#../Subsystems/AppDev/Content/A_Navigation/Pages/HomeAppDev5.htm?TocPath=Technology%2520platform%257CApplication%2520Development%2520(Magik)%257C_____1) on the Smallworld GNM documentation web sight.

If you are already familiar with Magik and Smallworld, read through the feature highlights below for more information on using the VS Code extension to help you write Magik code.

The hotkey `<CTRL>+<SHFT>+P` is used to open the command palette in Visual Studio Code.  You can first open the command palette, then type _magik_ to discover the features of the VS Code Magic extension.

## Feature highlights

* See [Compiling code and running tests](./docs/compiling.md) to understand how to compile code in your session.
* See [Using the class browser](./docs/navigation.md) to understand how to use the class browser tool and navigate in VS Code.
* See [Using the magik console](./docs/console.md) to understand how to use a Magik Console
* See [Formatting and Editing](./docs/formatting.md) for information on formatting Magik code and using editing templates.
* See [Linting and Debugging](./docs/debugging.md) for information on finding code problems with the Magik Linter and using the Magik debugger.
* See [Development Tools](./docs/dev_tools.md) for information on available development tools.

## Setting up your environment

For more on how to start a Magik session and configuring your Magik environment see the [Getting Started](./docs/getting_started.md) documentation.

## Contributing

We welcome your contributions and thank you for working to improve the Magik development experience in VS Code. If you would like to help work on the VS Code Magik extension, see our [contribution guide](./docs/contributing.md) to learn how to build and run the VS Code Magik extension locally and contribute to the project.

## License

[Apache License, Version 2.0 (the &#34;License&#34;)](./copyright-magik-vscode.md)
