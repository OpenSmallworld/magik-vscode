' Example of use: cscript test.vbs "Visual Studio Code" "sw_magik_win32.exe" "hello"

Option Explicit

Dim Shell
Set Shell = CreateObject("WScript.Shell")

Shell.AppActivate WScript.Arguments(1)
WScript.Sleep(10)
Shell.SendKeys WScript.Arguments(2)
Shell.SendKeys "{ENTER}${ENTER}"
WScript.Sleep(10)

Shell.AppActivate WScript.Arguments(0)
