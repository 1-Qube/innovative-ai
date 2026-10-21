# SYNA launcher: start localhost and print a GitHub-deploy checklist.
# Double-click "START SYNA.vbs" or the Desktop shortcut. Do not run the commands by hand.
param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Get-Port {
  $port = 8788
  $envFile = Join-Path $Root ".env"
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match '^\s*PORT\s*=\s*(\d+)\s*$') { $port = [int]$Matches[1] }
    }
  }
  return $port
}

function Get-NodeExe {
  $candidates = @(
    "$env:LOCALAPPDATA\pi-node\current\node.exe",
    "$env:ProgramFiles\nodejs\node.exe"
  )
  foreach ($path in $candidates) {
    if (Test-Path $path) { return $path }
  }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "node.exe was not found. Install Node or open a terminal where node works."
}

function Get-SynaProcess {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match 'server\.js' -and
      $_.CommandLine -like "*$Root*"
    }
}

function Test-Health([int]$Port) {
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
  } catch {
    return $null
  }
}

function Test-Home([int]$Port) {
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 3
    return ($resp.StatusCode -eq 200 -and $resp.Content -match "SYNA")
  } catch {
    return $false
  }
}

function Start-SynaServer([int]$Port) {
  $existing = @(Get-SynaProcess)
  if ($existing.Count -gt 0 -and (Test-Health $Port)) {
    return @{ Started = $false; Reused = $true; Pid = $existing[0].ProcessId }
  }

  $node = Get-NodeExe
  $outLog = Join-Path $Root "server.log"
  $errLog = Join-Path $Root "server.err.log"
  $proc = Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $Root `
    -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
  Set-Content -Path (Join-Path $Root "server.pid") -Value $proc.Id -Encoding ascii

  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 400
    if (Test-Health $Port) {
      return @{ Started = $true; Reused = $false; Pid = $proc.Id }
    }
    if ($proc.HasExited) { break }
  }

  $err = ""
  if (Test-Path $errLog) { $err = (Get-Content $errLog -Raw -ErrorAction SilentlyContinue) }
  if (-not $err -and (Test-Path $outLog)) { $err = (Get-Content $outLog -Raw -ErrorAction SilentlyContinue) }
  throw "Localhost did not come up on port $Port.`n$err"
}

function Stop-SynaServer {
  $stopped = @()
  foreach ($proc in @(Get-SynaProcess)) {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    $stopped += $proc.ProcessId
  }
  $pidFile = Join-Path $Root "server.pid"
  if (Test-Path $pidFile) { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }
  return $stopped
}

function Get-DeployReport([int]$Port) {
  $lines = New-Object System.Collections.Generic.List[string]
  $blockers = New-Object System.Collections.Generic.List[string]
  $health = Test-Health $Port
  $home = Test-Home $Port

  $lines.Add("LOCALHOST")
  if ($health) {
    $models = ($health.models -join ", ")
    $lines.Add("  PASS  http://127.0.0.1:$Port is answering")
    if ($health.ok) {
      $lines.Add("  PASS  Gemini key is loaded ($models)")
    } else {
      $lines.Add("  FAIL  Server is up but GEMINI_API_KEY is missing")
      $blockers.Add("Put GEMINI_API_KEY in .env (this file stays off GitHub).")
    }
  } else {
    $lines.Add("  FAIL  Nothing is listening on http://127.0.0.1:$Port")
    $blockers.Add("Start localhost first.")
  }
  if ($home) {
    $lines.Add("  PASS  Homepage returns the SYNA page")
  } else {
    $lines.Add("  FAIL  Homepage did not return the SYNA page")
    $blockers.Add("Homepage check failed.")
  }

  $lines.Add("")
  $lines.Add("GITHUB")
  $ignorePath = Join-Path $Root ".gitignore"
  $ignore = @()
  if (Test-Path $ignorePath) { $ignore = @(Get-Content $ignorePath) }
  foreach ($needed in @("server.log", "server.pid", ".probe")) {
    if ($ignore -contains $needed) {
      $lines.Add("  PASS  .gitignore excludes $needed")
    } else {
      $lines.Add("  FAIL  .gitignore does not exclude $needed")
      $blockers.Add("Add $needed to .gitignore before any push.")
    }
  }
  if ($ignore -contains ".env") {
    $lines.Add("  NOTE  .env is gitignored, so a GitHub clone will not have the API key")
  } else {
    $lines.Add("  PASS  .env is included, so a clone keeps the API key")
    $lines.Add("  NOTE  The GitHub repo must stay private. A public repo exposes the key.")
  }

  $key = ""
  $envFile = Join-Path $Root ".env"
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match '^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$') {
        $key = $Matches[1].Trim().Trim('"').Trim("'")
      }
    }
  } else {
    $lines.Add("  FAIL  .env is missing")
    $blockers.Add("Create .env with GEMINI_API_KEY. Never commit that file.")
  }

  $leaks = @()
  if ($key.Length -gt 8) {
    Get-ChildItem -File $Root | Where-Object { $_.Name -ne ".env" } | ForEach-Object {
      $text = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
      if ($text -and $text.Contains($key)) { $leaks += $_.Name }
    }
  }
  if ($leaks.Count -eq 0) {
    $lines.Add("  PASS  API key is not copied into source files")
  } else {
    $lines.Add("  FAIL  API key appears in: $($leaks -join ', ')")
    $blockers.Add("Remove the API key from source before GitHub.")
  }

  $gitOk = $false
  try {
    git -C $Root rev-parse --is-inside-work-tree 1>$null 2>$null
    $gitOk = ($LASTEXITCODE -eq 0)
  } catch {
    $gitOk = $false
  }
  if (-not $gitOk) {
    $lines.Add("  FAIL  This folder is not a git repo yet")
    $blockers.Add("No git repo, so GitHub has nothing to deploy.")
  } else {
    $lines.Add("  PASS  Git repo exists")
    $remote = ""
    try { $remote = (git -C $Root remote get-url origin 2>$null) } catch { $remote = "" }
    if ($remote) {
      $lines.Add("  PASS  origin is $remote")
    } else {
      $lines.Add("  FAIL  No GitHub remote named origin")
      $blockers.Add("Add a GitHub remote before push.")
    }
    git -C $Root ls-files --error-unmatch -- .env 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) {
      $lines.Add("  PASS  .env is tracked, API key stays with the repo")
    } else {
      $lines.Add("  FAIL  .env is not in git, so GitHub will not have the API key")
      $blockers.Add("Add .env before pushing if the clone must keep the key.")
    }
  }

  $lines.Add("  NOTE  GitHub Pages cannot run server.js.")
  $lines.Add("        The repo keeps the API key so a clone still works.")
  $lines.Add("        Keep the GitHub repo private.")

  $lines.Add("")
  if ($health -and $health.ok -and $home -and $blockers.Count -eq 0) {
    $lines.Add("VERDICT  Localhost is ready. Repo is safe to push.")
    $lines.Add("         Still host the server on Render/Railway/Fly, not GitHub Pages.")
  } elseif ($health -and $health.ok -and $home) {
    $lines.Add("VERDICT  Localhost is ready. Not ready for GitHub yet.")
    foreach ($item in $blockers) { $lines.Add("         - $item") }
  } else {
    $lines.Add("VERDICT  Not ready.")
    foreach ($item in $blockers) { $lines.Add("         - $item") }
  }

  return ($lines -join "`r`n")
}

if ($CheckOnly) {
  $port = Get-Port
  Write-Output (Get-DeployReport $port)
  exit 0
}

if ([Threading.Thread]::CurrentThread.ApartmentState -ne "STA") {
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-WindowStyle", "Hidden",
    "-File", $PSCommandPath
  )
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:Port = Get-Port
$bg = [System.Drawing.Color]::FromArgb(14, 14, 16)
$muted = [System.Drawing.Color]::FromArgb(168, 168, 176)
$lime = [System.Drawing.Color]::FromArgb(198, 241, 53)
$ink = [System.Drawing.Color]::FromArgb(18, 18, 20)

$form = New-Object System.Windows.Forms.Form
$form.Text = "SYNA"
$form.Size = New-Object System.Drawing.Size(560, 700)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = $bg
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = "SYNA"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 22, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = $lime
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(24, 18)
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Start localhost and check GitHub readiness. No commands."
$sub.ForeColor = $muted
$sub.AutoSize = $true
$sub.Location = New-Object System.Drawing.Point(28, 62)
$form.Controls.Add($sub)

function New-Button($text, $x, $y, $w, $back, $fore) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text
  $b.Location = New-Object System.Drawing.Point($x, $y)
  $b.Size = New-Object System.Drawing.Size($w, 42)
  $b.FlatStyle = "Flat"
  $b.FlatAppearance.BorderSize = 0
  $b.BackColor = $back
  $b.ForeColor = $fore
  $b.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
  $b.Cursor = [System.Windows.Forms.Cursors]::Hand
  return $b
}

$startBtn = New-Button "START LOCALHOST" 24 100 250 $lime $ink
$checkBtn = New-Button "CHECK ONLY" 286 100 160 ([System.Drawing.Color]::FromArgb(36, 36, 40)) ([System.Drawing.Color]::White)
$stopBtn = New-Button "STOP" 458 100 76 ([System.Drawing.Color]::FromArgb(48, 28, 28)) ([System.Drawing.Color]::FromArgb(255, 140, 140))
$form.Controls.Add($startBtn)
$form.Controls.Add($checkBtn)
$form.Controls.Add($stopBtn)

$openLink = New-Object System.Windows.Forms.LinkLabel
$openLink.Text = "Open http://127.0.0.1:$($script:Port)"
$openLink.Location = New-Object System.Drawing.Point(26, 154)
$openLink.AutoSize = $true
$openLink.LinkColor = $lime
$openLink.ActiveLinkColor = [System.Drawing.Color]::White
$openLink.Add_LinkClicked({ Start-Process "http://127.0.0.1:$($script:Port)/" })
$form.Controls.Add($openLink)

$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true
$box.ReadOnly = $true
$box.ScrollBars = "Vertical"
$box.Location = New-Object System.Drawing.Point(24, 186)
$box.Size = New-Object System.Drawing.Size(510, 450)
$box.BackColor = [System.Drawing.Color]::FromArgb(22, 22, 26)
$box.ForeColor = [System.Drawing.Color]::FromArgb(230, 230, 230)
$box.BorderStyle = "None"
$box.Font = New-Object System.Drawing.Font("Consolas", 10)
$box.Text = "Press START LOCALHOST.`r`n`r`nThat boots the server, opens the page, and checks whether this folder is safe to put on GitHub."
$form.Controls.Add($box)

function Show-Report {
  $box.Text = Get-DeployReport $script:Port
}

$startBtn.Add_Click({
  $startBtn.Enabled = $false
  $checkBtn.Enabled = $false
  $box.Text = "Starting http://127.0.0.1:$($script:Port) ..."
  $form.Refresh()
  try {
    $meta = Start-SynaServer $script:Port
    Show-Report
    if ($meta.Reused) {
      $box.Text = "Already running (pid $($meta.Pid)).`r`n`r`n" + $box.Text
    } else {
      $box.Text = "Started (pid $($meta.Pid)).`r`n`r`n" + $box.Text
    }
    Start-Process "http://127.0.0.1:$($script:Port)/"
  } catch {
    $box.Text = $_.Exception.Message
  } finally {
    $startBtn.Enabled = $true
    $checkBtn.Enabled = $true
  }
})

$checkBtn.Add_Click({
  $box.Text = "Checking..."
  $form.Refresh()
  Show-Report
})

$stopBtn.Add_Click({
  $ids = @(Stop-SynaServer)
  if ($ids.Count -eq 0) {
    $box.Text = "No SYNA server was running."
  } else {
    $box.Text = "Stopped pid $($ids -join ', ').`r`n`r`n" + (Get-DeployReport $script:Port)
  }
})

[void]$form.ShowDialog()
