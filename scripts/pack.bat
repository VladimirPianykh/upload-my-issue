@echo off
rem pack.bat lives in <repo>\scripts, so the repo root is one level up
cd /d "%~dp0.."

if not exist ".git" (
    echo Expected to find .git in: %CD%
    echo Is pack.bat still located in "<repo>\scripts"?
    pause
    exit /b 1
)

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