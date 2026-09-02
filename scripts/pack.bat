@echo off
git diff --quiet HEAD
if errorlevel 1 (
    echo There are not commited changes
    pause
    exit /b 1
)

for /f %%i in ('git ls-files --others --exclude-standard') do (
    echo There are untracked files
    pause
    exit /b 1
)

git archive -o project.zip HEAD