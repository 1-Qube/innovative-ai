Set sh = CreateObject("Wscript.Shell")
sh.CurrentDirectory = "C:\Users\Nomad\innovative ai"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File ""C:\Users\Nomad\innovative ai\start-syna.ps1""", 0, False
