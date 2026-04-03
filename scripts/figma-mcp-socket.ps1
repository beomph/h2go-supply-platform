# TalkToFigma MCP용 WebSocket 중계 서버 (공식 저장소 src/socket.ts)
# 사용 전: Bun 설치 — https://bun.sh
# 실행: npm run figma-mcp:socket

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$cloneDir = Join-Path $repoRoot ".cache\cursor-talk-to-figma-mcp"
$socketTs = Join-Path $cloneDir "src\socket.ts"

if (-not (Test-Path $socketTs)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $cloneDir) | Out-Null
    if (Test-Path $cloneDir) {
        Remove-Item -Recurse -Force $cloneDir
    }
    git clone --depth 1 "https://github.com/sonnylazuardi/cursor-talk-to-figma-mcp.git" $cloneDir
}

$bun = $null
try {
    $bun = (Get-Command bun -ErrorAction Stop).Source
} catch {
    $candidate = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
    if (Test-Path $candidate) { $bun = $candidate }
}

if (-not $bun) {
    Write-Error "Bun을 찾을 수 없습니다. PowerShell: irm bun.sh/install.ps1 | iex"
}

Write-Host "Figma MCP WebSocket: ws://127.0.0.1:3055 (중지: Ctrl+C)"
& $bun "run" $socketTs
