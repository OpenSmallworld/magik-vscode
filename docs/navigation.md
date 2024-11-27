# The Class Browser and Code Navigation

The Magik Extension provides a number of tools for code navigation.  The table below summarizes the hotkeys used to activate the navigation tools and describes their use.
	
Hotkey | Description
--------|-------------
`F3` | By placing the edit cursor on a method name and typing `F3`, the method name is copied to the Class Browser.  This is called _Magik Go to Clipboard_ in the command palette (`<CTRL>+<SHFT>+P`).  When we hover over the method, we can see the equivalent _goto_ item in the hover popup.
`<ALT>+.` | By placing the edit cursor on a method name and typing `<ALT>+.` you can navigate to the definition of the method.  If the definition is not found, references to the method are shown in the _peek dialogue_.
`<ALT>+<Right Arrow>`| Navigate to the next location.
`<ALT>+<Left Arrow>` | Navigate to the previous location.
`<ALT>+[` | Go to the next member (method) in the file and select its text.
`<ALT>+]` | Go to the previous member (method) in the file and select its text.
`<CTRL>+B` | Open the class browser.  This will connect the class browser if it is not already connected.

Hovering over a method name will also bring up the navigation hover window.  When you hover over a member being used in a method, the hover window gives the following popup window.

![Hover Over Method](./images/method_call_hover.png)

This provides the following functionality:

* Search - search for the target member in _Folder_, _Module_, _Product_ or VS Code _Workspace_.
* Search Definitions - copy the text to the class browser for searching via class browser.
* Go To Definition - navigate to the definition of the method under the cursor.
* Peek Definition or Peek References - open the _Peek_ popup and show the method implementation or the implementation and references to the method.

![Definition in Peek](./images/definition_in_peek.png)

When we select the _references_ in the peek window, we see all the locations where the method is being used.

![References in Peek](./images/references_in_peek.png)

## The Class Browser

The Class Browser in VS Code provides a user interface dialogue that interacts with the Magik _method finder_.  When the edit focus and cursor is in a Magik file, the hotkey `<CTRL>+B` will open the dialogue and connect it to the method finder.  You can open the class browser using the hotkey `<CTRL>+B` when the keyboard focus is in a Magik code file or with the menu item _view >> Open View..._ (type _Magik class browser_) 

The class browser in VS Code is a dialogue window that can be moved into a number of areas allowing you to decide the most appropriate location based on your preferences and hardware.  The screenshot below shows some of the possibilities.

![View Class Browser](./images/view_class_browser.png)

You can locate the class browser either in the terminal window or as a panel (as seen in the screenshot above).  This means the view can be moved:

* to the right or left side of the application, or
* docked at the bottom of the application.

In either case, the Class Browser view can either be:

* docked as a new panel in the location, or
* added as a new section in an existing panel.

The screenshot below shows the possibilities.  You cannot dock the class browser as an edit window nor outside the application frame as a floating window.

![Position Class Browser](./images/position_class_browser.png)

The class browser dialogue itself allows the user to type either class name or method name text to perform searches in the loaded class files.  The radio buttons allow users to filter the results, to show the argument names, and to see the method documentation text as required.  Clicking on the method will open the method implementation in a Magik text editor (if the source code can be located).  Additional information from the method pragmas are also displayed in the class browser method line.

![The Class Browser](./images/class_browser.png)

## Traceback Navigation

Finally, when a traceback is raised during a running Magik session, the traceback text in the session terminal can be used to navigate to the code associated with the traceback.  Simply `<CTRL>+<Right Click>` on a line of the traceback and you can navigate to the code file that is mentioned in the traceback (note, sometimes the terminal windows is not wide enough to keep the location information on one line and this may cause the code file search to fail).

![Traceback Navigation](./images/traceback_navigation.png)

> Go back to [README](../README.md) for more on the Magik extension for VS Code

> Go to next topic [Formatting and Editing](./formatting.md).
