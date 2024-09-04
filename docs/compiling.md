# Compiling code and Running Tests

You can use the following hotkeys to compile your code and run your tests in the Magik session.

 Hotkey | Description
--------|-------------
 `<CTRL>+<SHFT>+F7`   |Load the module and compile the code for the focused VS Code Magik file.  As we don't normally load tests when we start a Magik session, this is often a good way to force your test modules to open.  As they should be dependent on MUnit, it will also load MUnit.  The session in the focused terminal used to compile the code.
 `<CTRL>+F7` | Compile the Magik code for the focused VS Code Magik editor.  This is standard way to compile or recompile a Magik file.  The session in the focused terminal used to compile the code.
 `<CTRL>+<ALT>+F7` | Run all the tests in the MUnit test case in the focused VS Code Magic editor.  The file must be a subclass of test_case or the command is ignored. The session in the focused terminal used to run the test case.
 `<ALT>+F7` | Run a single test method in the MUnit test case in the focused VS Code Magik editor.  The test method where the edit cursor is placed determines the test to be run.  If the cursor is not in a test method (i.e. a method whose name starts with test_) or if the class is not a subclass of test_case the request is ignored.  The session in the focused terminal used to run the test case.  This is the fastest way to run a single test method.
 `<CTRL>+<ALT>+P` | Open the command palette to chose a command from VS Code and the loaded extensions.  Type `Magik` to see the commands for the VS Code Magik extension
