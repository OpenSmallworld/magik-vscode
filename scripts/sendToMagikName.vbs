' Example of use: cscript sendToMagikName.vbs "Visual Studio Code" "sw_magik_win32.exe" "hello"

Option Explicit

Dim Shell, WMI, wql, process
Set Shell = CreateObject("WScript.Shell")
Set WMI = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")
wql = "SELECT ProcessId FROM Win32_Process WHERE name = '" & WScript.Arguments(1) & "'"

For Each process In WMI.ExecQuery(wql)
    Shell.AppActivate process.ProcessId
    WScript.Sleep(10)
    Shell.SendKeys WScript.Arguments(2)
    Shell.SendKeys "{ENTER}${ENTER}"
    WScript.Sleep(10)
Next

Shell.AppActivate WScript.Arguments(0)
