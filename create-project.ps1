# Create the project directory
$projectPath = "E:\Norton-Gauss\playwright-automation"

if (-not (Test-Path $projectPath)) {
    New-Item -ItemType Directory -Path $projectPath -Force
    Write-Host "Created directory: $projectPath" -ForegroundColor Green
}

# Copy all files from this setup folder to the new project
$sourceFiles = @(
    "package.json",
    "server.js", 
    "Dockerfile",
    "render.yaml",
    ".gitignore",
    "README.md"
)

foreach ($file in $sourceFiles) {
    $source = Join-Path $PSScriptRoot $file
    $dest = Join-Path $projectPath $file
    if (Test-Path $source) {
        Copy-Item -Path $source -Destination $dest -Force
        Write-Host "Copied: $file" -ForegroundColor Cyan
    }
}

Write-Host "`n✅ Project created at: $projectPath" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. cd $projectPath"
Write-Host "2. git init"
Write-Host "3. git add ."
Write-Host "4. git commit -m 'Initial commit'"
Write-Host "5. Create GitHub repo and push"
Write-Host "6. Deploy to Render"
