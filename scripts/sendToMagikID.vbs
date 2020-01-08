' Example of use: cscript test.vbs "sw_magik_win32.exe" "hello"

Option Explicit

Dim Shell
Set Shell = CreateObject("WScript.Shell")

Shell.AppActivate WScript.Arguments(0)
Shell.SendKeys WScript.Arguments(1)
Shell.SendKeys "{ENTER}${ENTER}"