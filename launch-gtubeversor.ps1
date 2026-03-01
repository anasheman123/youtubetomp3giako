$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://localhost:3020"
$browserProfileDir = Join-Path $appRoot ".gtubeversor-browser"

$browserCandidates = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

$browserPath = $browserCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browserPath) {
  throw "No se encontro Edge o Chrome para abrir la app."
}

$serverProcess = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru

try {
  $started = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500

    if ($serverProcess.HasExited) {
      throw "El servidor se cerro al iniciar."
    }

    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $started = $true
        break
      }
    } catch {
    }
  }

  if (-not $started) {
    throw "La app no respondio en localhost:3020."
  }

  New-Item -ItemType Directory -Force -Path $browserProfileDir | Out-Null

  $browserArgs = @(
    "--app=$url",
    "--user-data-dir=$browserProfileDir",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=msEdgeSidebarV2",
    "--new-window"
  )

  $browserProcess = Start-Process -FilePath $browserPath -ArgumentList $browserArgs -WorkingDirectory $appRoot -PassThru
  Wait-Process -Id $browserProcess.Id
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
  }

  if (Test-Path $browserProfileDir) {
    Remove-Item -Path $browserProfileDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
