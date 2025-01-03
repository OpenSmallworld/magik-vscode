# The Class Browser and Code Navigation

The Magik Extension provides a number of tools for code navigation.  The table below summarizes the hotkeys used to activate the navigation tools and describes their use.

Hotkey | Description
--------|-------------
`F3` or `<ALT>+.` | By placing the edit cursor on a method name and typing `F3` (_Magik Go To Clipboard_) or `<ALT>+.` (_Magic Go To_), the Class Browser is used to search for the method definitions.  The commands cited above are the names used in command palette (`<CTRL>+<SHFT>+P`).
`<ALT>+,` | By placing the edit cursor on a method name and typing `<ALT>+,` the definition or references to the member shown in the _Peek References Dialogue_ (equivalent to selecting _Peek References_ from the hover popup).
`<ALT>+<Right Arrow>`| Navigate to the next location.
`<ALT>+<Left Arrow>` | Navigate to the previous location.
`<ALT>+[` | Go to the next member (method) in the file and select its text.
`<ALT>+]` | Go to the previous member (method) in the file and select its text.
`<CTRL>+B` | Open the Class Browser.

Hovering over a method name will also bring up the navigation hover window.  This window provides additional tools for navigation.

![Hover Over Method](./images/method_call_hover.png)

The hover window provides the following functionality:

* Search - search using VS code full text for the member.  The search may be restricted by _Folder_, _Module_, _Product_ or VS Code _Workspace_.
* Search Definitions - copy the text to the Class Browser for searching via Class Browser.
* Go To Definition - navigate to the definition of the method under the cursor or copy the text to the Class Browser for navigation if the definition is ambiguous.
* Peek Definition or Peek References - open the _Peek_ popup and show the method implementation or the implementation and references to the method.

The _peek window_ will show the definition of the method in question in a popup with changing the current location in the editor.

![Definition in Peek](./images/definition_in_peek.png)

When we select the _references_ in the peek window, we see all the locations where the method is being used.

![References in Peek](./images/references_in_peek.png)

## The Class Browser

The Class Browser in VS Code provides a user interface dialogue that interacts with the Magik _method finder_.  When the edit focus and cursor is in a Magik file, the hotkey `<CTRL>+B`.  The VS Code menu item _view >> Open View..._ (type _Magik class browser_) will also open the dialogue.  Click on the _Connect_ button of the Class Browser dialog to connect it to the _Method Finder_.

The Class Browser in VS Code is a dialogue window that can be moved into a number of areas allowing each user to decide the most appropriate location based on his or her preferences and hardware.  The screenshot below shows some of the possibilities.

![View Class Browser](./images/view_class_browser.png)

The Class Browser can be located interactively either in the terminal window or as a panel (as seen in the screenshot above).  This means the view can be moved:

* to the right or left side of the application, or
* docked at the bottom of the application.

In either case, the Class Browser view can either be:

* docked as a new panel in the location, or
* added as a new section in an existing panel.

The screenshot below shows the possibilities.  The Class Browser cannot be docked in an edit window nor moved outside the application frame as a floating window.

![Position Class Browser](./images/position_class_browser.png)

The Class Browser dialogue itself allows the user to type either class name or method name text to perform searches in the loaded class files.  The radio buttons allow users to filter the results, or to show the argument names, and to see the method documentation text as required.  Clicking on the method will open the method implementation in a Magik text editor (if the source code can be located).  Additional information from the method pragmas are also displayed in the Class Browser method line.

![The Class Browser](./images/class_browser.png)

## Traceback Navigation

Finally, when a traceback is raised during a running Magik session, the traceback text in the session terminal can be used to navigate to the code associated with the traceback.  Simply `<CTRL>+<Right Click>` on a line of the traceback to navigate to the code file that is mentioned in the traceback (note, sometimes the terminal windows is not wide enough to keep the location information on one line and this may cause the code file search to fail).

![Traceback Navigation](./images/traceback_navigation.png)

> Go back to [README](../README.md) for more on the Magik extension for VS Code
>
> Go to next topic [Formatting and Editing](./formatting.md).
