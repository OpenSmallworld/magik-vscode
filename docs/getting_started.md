
# Getting Started with Magik Sessions

Before discussing how to start a Magik session in the VS Code extension it is useful to consider how the extension can be installed and configured.

## Installation

The GE Magik VS code extension is now integrated with the [VS Code marketplace](https://marketplace.visualstudio.com/vscode).  The extension can be found by searching in the extension side-tab using the _Search Extensions in Marketplace_ text edit and typing, for example, _Magik_ as shown below.  There are several Magik language extensions, but we want the one called _Magik VS Code_ that is provided by _GE Smallworld_.  This extension is associated with the VS Code extension in Open Smallworld on the public GitHub at [OpenSmallworld magik-vscode](https://github.com/OpenSmallworld/magik-vscode).  This repository is a publication of the internal GE magik-vscode repository.

![Installation from VS code](./images/install_from_vscode.png)

Normally you can easily install the extension by clicking on the install button, but in some cases this has may fail due to security or proxy settings on the machine in question.  This is not a problem be we can easily download the installer for the plugin from the VS Code Market Place at [Magik VS Code Extension](https://marketplace.visualstudio.com/items?itemName=ge-smallworld.magik-vscode).  This is delivered as a VSIX file (basically a Visual Studio Installer bundle).  The file should be downloaded and unblocked to a known location (e.g. downloads) as you would for any other files.   We can then install the file using the extra options menu button (...) at the top of the _Plugins tool_ as shown in the screenshot below.

![Installation from VS code](./images/install_from_vsx_file.png)

Once you have installed the Magik plugin, when you open a Magik source code file, you should see the Magik code colouring immediately.

## Managing Character Encodings

After installing the VS code extension for Magik, you should set the default character encodings for Magik files.  If you are used to using files in different character sets it is important to know that VS Code with the Magik plugin does not respect the text encoding file header and so care must be taken when open files containing non-ascii characters.  VS Code will use UTF-8 as the default encoding, but I have had problems with this configuration for historic Magik projects.  It seems that ISO-8859-1 (Latin 1) is more often used and thus, I would recommend setting the default to ISO-8859-1, but care must be taken when working with other formats.  Saving a file in the wrong character encoding can damage the file making it difficult to recover (luckily these file are in generally in Git).  You can always see the encoding of the file in the information bar at the bottom of VS Code (see below).  Clicking on the encoding will allow you to save or open the file using a different encoding.  So, it is possible to reopen a file that was opened with an incorrect encoding by specifying the correct encoding.

![File Encoding - Status bar](./images/encoding_statusbar.png)

You can easily configure the default encoding for Magik.  First open the settings page from the menu item at _File > Preferences > Settings_.  When the settings page opens, type the search string `@lang; magik` as shown in the screenshot below.  Then select the Files section and find the Encoding setting and set it to `ISO-8859-1` (or any other encoding that is appropriate for your work).  Note, message (msg) files are not covered by this setting and care must be taken when editing these types of files (especially as they have a tendency to use the more exotic encodings).

![File Encoding - default setting](./images/encoding_default.png)

## Starting a Session

Historically, in Emacs, the key sequence `<F2>+Z` could be use to bring up the GIS console where we can execute the run alias command to start a session.  In VS Code `<F2>+Z`, will start a sequence of user interface dialogues that will assist the user in creating the runalias.exe command.  The first dialogue expects that the user to pick the directory containing an aliases file.  Typically this will be in the config directory in the target product.  The dialogue acts as a directory picker and does not show the files contained in the directory, so you have to know where to look.  This is generally where you see the magik_sessions directory.  When you are in the correct directory, click on the Search for aliases button to select the directory.

![Open Session - search alias](./images/session_search_alias.png)

Next a dialogue opens where you are requested to find the _runalias.exe_ file.  This is the program that builds and launches the Java command to start the Smallworld session.  You are asked to select the file because if the environment variable `SMALLWORLD_GIS` is not defined, `runalias.exe` will define the variable relative to its location (it is in _core/bin/x86_ on Windows).

[Open Session - search runalias](./images/session_runalias.png)

Once you have selected the location of the _runalias.exe_ program, a drop down will appear from the VS Code search bar edit showing a list of aliases that can be started.

![Open Session - select alias](./images/session_select_alias.png)

Selecting an alias from the list will cause the VS Code tool to create a command line and start the session in the current terminal.

![Open Session - command](./images/session_command.png)

In fact, this is not a very interesting way to start a session and, as in Emacs, it is just as easy to craft our own command line as the one that can be started with `<F2>+Z` are limited to use the specifying where Smallworld is installed and which alias file and alias to use.  We often want to use a custom environment file (using the -e command line argument).  In addition, the PowerShell history will allow you to re-run previous commands to start the session.  

For simple projects, we just have to specify the location of _runalias.exe_ then use the project `environment.bat` file and select the alias. For simple projects applications can be started with a command line like this:

> PS\> C:\swEO533\core\bin\x86\runalias.exe -e environment.bat -a .\config\gis_aliases dms_sw_life_open -cli

Projects will generally have their own strategy for starting sessions depending on the requirements, the sessions and the team that creates the startup scripts. For more information on starting Smallworld session see the  [Launcher program](https://smallworld-gnm.gevernova.com/documentation/sw53/en/swDocs5.htm#../Subsystems/Core/Content/Sessions/LauncherProgram.htm?TocPath=Technology%2520platform%257CCore%257CMagik%2520sessions%257C_____5) page on the Smallworld GNM documentation website.

> Go back to [README](../README.md) for more on the Magik extension for VS Code



