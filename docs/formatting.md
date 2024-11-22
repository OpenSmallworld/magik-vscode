# Formatting and Editing

The VS Code extension for magik provides the following hotkeys to help formatting and editing magik code.

Hotkey | Description
--------|-------------
`<SHFT>+<ALT>+F` | Format current magik code file.
`<ALT>+F` | Format the method (region) in the code file that contains the edit cursor.
`<CRTL>+<SHFT>+I` | Apply proper indenting to the code file containing the edit cursor.
`<CTRL>+I` | Apply proper indenting to the method (region) containing the edit cursor.
`<ALT>+<ENTER>` | Apply proper indenting in from the start of the current method (region) to line containing the edit cursor.

In addition to adjusting the indenting, formatting will manage the spaces between method names and the parenthesis and adjust the 
spacing around operators.

Formatting and indenting may be undesired as they will be shown as changes in source code management tools like Git.

## Code Editing

VS Code provides a number of tools that can assist during code editing.  This includes syntax highlighting and code completion.
Code completion works by analysing the text being written and trying to make suggestions based on the current coding context as
shown in the screenshot below.  You can navigate in the suggested completions using the `<UP-ARROW>` and `<DOWN-ARROW>` keys and
entering return to apply the suggestion.  Sometimes the suggests are not appropriate and get in the way of the typing.  In this
case use the `<ESC>` key to remove the code suggests.  At any time you can type `<CTL>+<SPACEBAR>` to bring up a list of suggestions.

![Code Completion](./images/editing_completion.png)

The VS Code magik extension come with a set of code _snippets_ that can help you write repetitive code blocks quickly and easily.  Snippets are code templates that allow you to complete the variables in the template to have standard customizable code blocks.
The snippets are implemented as simple JSON files that allow you to extent, enhance or customize the snippets for a particular project.  The code snippets that ship with the extension are found in the file:

> %userprofile%\.vscode\extensions\ge-smallworld.magik-vscode-0.2.3\snippets\magik.snippets.json

Where `userprofile` is the Windows environment variable representing the current users home directory (e.g.`c:\users\name`). Each snippet has a _prefix_ attribute represents the text that can be used to activate the snippet.  For example, there is a snippet for creating a new method with the prefix _method_.  Typing the prefix or in many cases a few letters of the prefix, then using `<CRTL+SPACEBAR>` to show the completion menu, will show the snippets associated with the text.  Snippet items are prefixed with a small square in the popup menu as shown below.

![Activate Snippet](./images/activate_snippet.png)

Once the snippet is activated, the template text is shown with fields that can be completed and dropdown choice items using attribute lists to help the user complete the template text.

![Activate Snippet](./images/complete_snippet.png)

You can create custom snippet at the project (directory) or user (global) level using the menu item _File >> Preferences >> Configure Snippets_.  Use the _scope_ attributes to indicate the language that the snippet applies to in multi-language snippet files.  For more information on creating and using snippets see [Snippets in Visual Studio code](https://code.visualstudio.com/docs/editor/userdefinedsnippets).

> Go back to [README](../README.md) for more on the Magik extension for VS Code
