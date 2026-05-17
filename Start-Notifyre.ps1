# ============================================================
# Notifyre - PowerShell Setup & GitHub Upload Script
# Run this from the folder containing 'notification-engine'
# ============================================================

param(
    [string]$GitHubUsername = "",
    [string]$RepoName = "notifyre"
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host " $msg" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-OK($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }

# ---- Intro ----
Write-Host @"
  _   _       _   _  __
 | \ | | ___ | |_(_)/ _|_   _ _ __ ___
 |  \| |/ _ \| __| | |_| | | | '__/ _ \
 | |\  | (_) | |_| |  _| |_| | | |  __/
 |_| \_|\___/ \__|_|_|  \__, |_|  \___|
                         |___/
 Event-Driven Notification Engine
"@ -ForegroundColor Magenta

# ---- Check Docker ----
Write-Step "Checking Docker"
try {
    $dockerVersion = docker --version 2>&1
    Write-OK "Docker found: $dockerVersion"
} catch {
    Write-Fail "Docker not found! Please install Docker Desktop from https://docker.com"
    exit 1
}

try {
    docker info 2>&1 | Out-Null
    Write-OK "Docker daemon is running"
} catch {
    Write-Fail "Docker daemon is not running. Please start Docker Desktop and try again."
    exit 1
}

# ---- Navigate to project ----
Write-Step "Locating project"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = Join-Path $scriptDir "notification-engine"

if (-Not (Test-Path $projectPath)) {
    $projectPath = Join-Path (Get-Location) "notification-engine"
}

if (-Not (Test-Path $projectPath)) {
    Write-Fail "Cannot find 'notification-engine' folder. Make sure this script is in the same folder as the notification-engine directory."
    exit 1
}

Set-Location $projectPath
Write-OK "Project found at: $projectPath"

# ---- Check .env files ----
Write-Step "Checking configuration"

$apiEnv = "api-service\.env"
$workerEnv = "worker-service\.env"

if ((Get-Content $apiEnv) -match "YOUR_SENDGRID_KEY") {
    Write-Warn "API keys not configured yet. Running in DRY_RUN mode (no real emails/SMS)."
    Write-Warn "Edit api-service\.env and worker-service\.env to add real API keys later."
}

# Ensure DRY_RUN is set in worker .env
$workerEnvContent = Get-Content $workerEnv -Raw
if ($workerEnvContent -notmatch "DRY_RUN") {
    Add-Content $workerEnv "`nDRY_RUN=true"
    Write-OK "DRY_RUN=true added to worker-service/.env"
}

# ---- Build containers ----
Write-Step "Building Docker containers (this may take a few minutes first time)"

try {
    docker compose build
    Write-OK "Docker images built successfully"
} catch {
    Write-Fail "Docker build failed: $_"
    exit 1
}

# ---- Start containers ----
Write-Step "Starting all services"

try {
    docker compose up -d
    Write-OK "All containers started"
} catch {
    Write-Fail "Failed to start containers: $_"
    exit 1
}

# ---- Wait for services ----
Write-Step "Waiting for services to be ready..."
Write-Host "Waiting 20 seconds for RabbitMQ and PostgreSQL to initialize..."
Start-Sleep -Seconds 20

# ---- Health check ----
Write-Step "Running health check"

$maxAttempts = 10
$attempt = 0
$healthy = $false

while ($attempt -lt $maxAttempts) {
    $attempt++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {
        Write-Host "  Attempt $attempt/$maxAttempts - API not ready yet, waiting..."
        Start-Sleep -Seconds 5
    }
}

if ($healthy) {
    Write-OK "API Service is healthy!"
} else {
    Write-Warn "API may still be starting. Check logs with: docker compose logs api-service"
}

# ---- Test notification ----
Write-Step "Sending a test notification"

$body = @{
    type      = "email"
    recipient = "test@example.com"
    message   = "Hello from Notifyre! Your event-driven notification engine is working."
} | ConvertTo-Json

try {
    $testResult = Invoke-WebRequest `
        -Uri "http://localhost:5000/api/notifications" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -UseBasicParsing

    $responseData = $testResult.Content | ConvertFrom-Json
    Write-OK "Test notification queued! Event ID: $($responseData.eventId)"
    Write-OK "(In DRY_RUN mode - check worker logs to see it processed)"
} catch {
    Write-Warn "Test notification failed: $_"
    Write-Warn "Check: docker compose logs api-service"
}

# ---- Show status ----
Write-Step "Service Status"
docker compose ps

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Notifyre is RUNNING!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host " API:          http://localhost:5000" -ForegroundColor White
Write-Host " RabbitMQ UI:  http://localhost:15672  (guest/guest)" -ForegroundColor White
Write-Host " PostgreSQL:   localhost:5432  (postgres/postgres)" -ForegroundColor White
Write-Host ""
Write-Host " Useful commands:" -ForegroundColor Yellow
Write-Host "   docker compose logs -f api-service    # API logs" -ForegroundColor Gray
Write-Host "   docker compose logs -f worker-service # Worker logs" -ForegroundColor Gray
Write-Host "   docker compose down                   # Stop all" -ForegroundColor Gray
Write-Host "   docker compose down -v                # Stop + delete data" -ForegroundColor Gray
Write-Host ""

# ---- GitHub upload ----
Write-Step "GitHub Upload"

$doGitHub = Read-Host "Do you want to upload this project to GitHub? (y/n)"

if ($doGitHub -ne "y") {
    Write-Host "Skipping GitHub upload. You can run this script again to upload later." -ForegroundColor Yellow
    exit 0
}

# Check git
try {
    git --version | Out-Null
    Write-OK "Git found"
} catch {
    Write-Fail "Git not installed. Download from https://git-scm.com and re-run."
    exit 1
}

# Check GitHub CLI
$hasGhCli = $false
try {
    gh --version | Out-Null
    $hasGhCli = $true
    Write-OK "GitHub CLI found"
} catch {
    Write-Warn "GitHub CLI not found. You'll need to create the repo manually."
    Write-Host "Install it from: https://cli.github.com" -ForegroundColor Yellow
}

if ($GitHubUsername -eq "") {
    $GitHubUsername = Read-Host "Enter your GitHub username"
}

# Init git repo
if (-Not (Test-Path ".git")) {
    git init
    Write-OK "Git repository initialized"
}

# Ensure .gitignore covers node_modules
$gitignoreContent = Get-Content ".gitignore" -Raw -ErrorAction SilentlyContinue
if ($gitignoreContent -notmatch "node_modules") {
    Add-Content ".gitignore" "`nnode_modules/"
}

git add .
git commit -m "feat: initial Notifyre event-driven notification engine" 2>&1

Write-OK "Files committed"

if ($hasGhCli) {
    Write-Host "`nCreating GitHub repository '$RepoName'..." -ForegroundColor Cyan
    
    try {
        gh auth status 2>&1 | Out-Null
    } catch {
        Write-Host "Please login to GitHub CLI first:" -ForegroundColor Yellow
        gh auth login
    }

    try {
        gh repo create $RepoName `
            --public `
            --description "Notifyre - Event-Driven Notification Engine with RabbitMQ, Docker, email and SMS" `
            --push `
            --source .
        
        Write-OK "Repository created and pushed!"
        Write-Host ""
        Write-Host " GitHub Repo: https://github.com/$GitHubUsername/$RepoName" -ForegroundColor Green
    } catch {
        Write-Warn "Auto-create failed. Creating remote manually..."
        git remote remove origin 2>&1 | Out-Null
        git remote add origin "https://github.com/$GitHubUsername/$RepoName.git"
        git branch -M main
        git push -u origin main
        Write-OK "Pushed to GitHub!"
    }
} else {
    Write-Host ""
    Write-Host "Manual GitHub steps:" -ForegroundColor Yellow
    Write-Host "1. Go to https://github.com/new" -ForegroundColor White
    Write-Host "2. Create a repo named: $RepoName" -ForegroundColor White
    Write-Host "3. Run these commands:" -ForegroundColor White
    Write-Host ""
    Write-Host "   git remote add origin https://github.com/$GitHubUsername/$RepoName.git" -ForegroundColor Cyan
    Write-Host "   git branch -M main" -ForegroundColor Cyan
    Write-Host "   git push -u origin main" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host " All done! Notifyre is live and optionally on GitHub." -ForegroundColor Magenta
Write-Host "======================================================" -ForegroundColor Magenta
