# Rigid Point Advisory (rigidpointadvisory.com) -> GitHub Pages
#
# Run in PowerShell:
#   cd C:\Users\hello\Downloads\vione_release\rpa
#   powershell -ExecutionPolicy Bypass -File .\deploy-rpa.ps1
#
# Requires: Git + GitHub CLI (gh auth login) - same as the legal / vione-site deploys.
# NOTE: this file is intentionally ASCII-only so Windows PowerShell 5.1 cannot
#       mis-decode it (that was what broke the previous version).

$ErrorActionPreference = "Continue"

$GHUSER = "hellosangwoo-ctrl"
$REPO   = "rpa-site"
$DOMAIN = "rigidpointadvisory.com"
$DIR    = $PSScriptRoot
if (-not $DIR) { $DIR = (Get-Location).Path }

function Say($msg, $color) { Write-Host $msg -ForegroundColor $color }

Write-Host ""
Say "=== Rigid Point Advisory -> GitHub Pages ===" "Cyan"
Write-Host "  Repo   : $GHUSER/$REPO"
Write-Host "  Domain : $DOMAIN"
Write-Host "  Folder : $DIR"
Write-Host ""

Set-Location $DIR

# --- sanity check -----------------------------------------------------------
if (-not (Test-Path "index.html")) {
    Say "[!!] index.html not found in this folder. Run the script inside the 'rpa' folder." "Red"
    exit 1
}
foreach ($cmd in @("git","gh")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Say "[!!] '$cmd' is not installed or not on PATH." "Red"
        exit 1
    }
}

gh auth status 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
    Say "[!!] GitHub CLI is not logged in. Run:  gh auth login" "Red"
    exit 1
}
Say "[ok] git + gh ready" "Green"

# --- required files ---------------------------------------------------------
if (-not (Test-Path "CNAME"))     { Set-Content -Path "CNAME"     -Value $DOMAIN -Encoding ASCII -NoNewline }
if (-not (Test-Path ".nojekyll")) { Set-Content -Path ".nojekyll" -Value ""      -Encoding ASCII -NoNewline }

# --- git --------------------------------------------------------------------
if (-not (Test-Path ".git")) {
    git init -b main 1>$null 2>$null
    Say "[ok] git init" "Green"
}
git add -A 1>$null 2>$null
git commit -m "rigidpointadvisory.com publish" 1>$null 2>$null
Say "[ok] commit" "Green"

# --- repo + push ------------------------------------------------------------
gh repo view "$GHUSER/$REPO" 1>$null 2>$null
$repoExists = ($LASTEXITCODE -eq 0)

if (-not $repoExists) {
    Say "[..] creating repo $GHUSER/$REPO" "Yellow"
    gh repo create "$GHUSER/$REPO" --public --source=. --push --description "Rigid Point Advisory - company site (static HTML)"
    if ($LASTEXITCODE -ne 0) { Say "[!!] gh repo create failed - see message above" "Red"; exit 1 }
    Say "[ok] repo created and pushed" "Green"
} else {
    $hasOrigin = (git remote 2>$null) -contains "origin"
    if (-not $hasOrigin) { git remote add origin "https://github.com/$GHUSER/$REPO.git" }
    git branch -M main 1>$null 2>$null
    git push -u origin main --force
    if ($LASTEXITCODE -ne 0) { Say "[!!] git push failed - see message above" "Red"; exit 1 }
    Say "[ok] pushed" "Green"
}

# --- enable Pages -----------------------------------------------------------
gh api -X POST "repos/$GHUSER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" 1>$null 2>$null
if ($LASTEXITCODE -eq 0) { Say "[ok] Pages enabled" "Green" }
else                     { Say "[..] Pages already enabled (or set it in Settings / Pages)" "Yellow" }

Start-Sleep -Seconds 3

# --- custom domain ----------------------------------------------------------
gh api -X PUT "repos/$GHUSER/$REPO/pages" -f "cname=$DOMAIN" 1>$null 2>$null
if ($LASTEXITCODE -eq 0) { Say "[ok] custom domain set: $DOMAIN" "Green" }
else                     { Say "[..] set the custom domain by hand in Settings / Pages" "Yellow" }

# --- clear the stale vione.app domain on the old repo -----------------------
$raw = gh api "repos/$GHUSER/vione-site/pages" 2>$null
if ($LASTEXITCODE -eq 0 -and $raw) {
    try {
        $old = $raw | ConvertFrom-Json
        if ($old.cname -eq "vione.app") {
            gh api -X PUT "repos/$GHUSER/vione-site/pages" -f "cname=" 1>$null 2>$null
            if ($LASTEXITCODE -eq 0) { Say "[ok] removed the wrong custom domain (vione.app) from vione-site" "Green" }
            else { Say "[..] could not clear vione.app on vione-site - do it in the vione-site repo Settings / Pages" "Yellow" }
        }
    } catch { }
}

# --- next steps -------------------------------------------------------------
Write-Host ""
Say "NEXT STEP 1 - add these DNS records at GoDaddy:" "Yellow"
Write-Host "  Type   Name   Value"
Write-Host "  A      @      185.199.108.153"
Write-Host "  A      @      185.199.109.153"
Write-Host "  A      @      185.199.110.153"
Write-Host "  A      @      185.199.111.153"
Write-Host "  CNAME  www    $GHUSER.github.io"
Write-Host ""
Say "NEXT STEP 2 - after DNS resolves, tick 'Enforce HTTPS' at:" "Yellow"
Write-Host "  https://github.com/$GHUSER/$REPO/settings/pages"
Write-Host ""
Say "Temporary test URL (works right away):" "Cyan"
Write-Host "  https://$GHUSER.github.io/$REPO/"
Write-Host ""
Say "Done. Copy this whole screen back into the chat." "Green"
Write-Host ""
