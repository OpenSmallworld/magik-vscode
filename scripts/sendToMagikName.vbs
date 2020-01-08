' Example of use: cscript test.vbs "sw_magik_win32.exe" "hello"

Option Explicit

Dim Shell, WMI, wql, process
Set Shell = CreateObject("WScript.Shell")
Set WMI = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")
wql = "SELECT ProcessId FROM Win32_Process WHERE name = '" & WScript.Arguments(0) & "'"

For Each process In WMI.ExecQuery(wql)
    Shell.AppActivate process.ProcessId
    Shell.SendKeys WScript.Arguments(1)
    Shell.SendKeys "{ENTER}${ENTER}"
Next