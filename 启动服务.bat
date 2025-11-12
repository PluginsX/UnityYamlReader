@echo off
REM 尝试设置UTF-8编码，如果失败则忽略
chcp 65001 >nul 2>&1
echo ========================================
echo Unity Prefab Reader Service Startup Script
echo ========================================
echo.

REM 检查Node.js是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not detected, please install Node.js first
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查并终止已运行的服务
echo [INFO] Checking for running service...
setlocal enabledelayedexpansion

REM 方法1: 使用PowerShell查找占用8000端口的进程
set FOUND=0
for /f "tokens=*" %%a in ('powershell -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess" 2^>nul') do (
    set PID=%%a
    if not "!PID!"=="" (
        echo [INFO] Found process using port 8000 (PID: !PID!)
        echo [INFO] Stopping process...
        taskkill /PID !PID! /F /T >nul 2>&1
        if !errorlevel! equ 0 (
            echo [INFO] Process stopped successfully
            set FOUND=1
        ) else (
            echo [WARN] Failed to stop process !PID!, trying alternative method...
            REM 尝试通过进程名终止所有node进程
            taskkill /IM node.exe /F /T >nul 2>&1
            set FOUND=1
        )
    )
)

REM 方法2: 检查所有node.exe进程，查找运行server.js的进程
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO LIST 2^>nul ^| findstr "PID:"') do (
    set NODE_PID=%%a
    REM 检查该进程的命令行是否包含server.js
    for /f "delims=" %%b in ('wmic process where "ProcessId=!NODE_PID!" get CommandLine /format:value 2^>nul ^| findstr /i "server.js"') do (
        if not "%%b"=="" (
            echo [INFO] Found running server.js process (PID: !NODE_PID!)
            echo [INFO] Stopping process...
            taskkill /PID !NODE_PID! /F /T >nul 2>&1
            if !errorlevel! equ 0 (
                echo [INFO] Process stopped successfully
                set FOUND=1
            )
        )
    )
)

REM 如果找到了进程，等待端口释放
if !FOUND!==1 (
    echo [INFO] Waiting for port to be released...
    timeout /t 3 /nobreak >nul
    
    REM 再次检查端口是否已释放，最多尝试3次
    set RETRY=0
    :CHECK_PORT
    set PORT_FREE=1
    for /f "tokens=*" %%a in ('powershell -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess" 2^>nul') do (
        set PORT_PID=%%a
        if not "!PORT_PID!"=="" (
            echo [WARN] Port 8000 is still in use by PID: !PORT_PID!
            echo [INFO] Attempting to force kill...
            taskkill /PID !PORT_PID! /F /T >nul 2>&1
            taskkill /IM node.exe /F /T >nul 2>&1
            set PORT_FREE=0
        )
    )
    
    if !PORT_FREE!==0 (
        set /a RETRY+=1
        if !RETRY! LSS 3 (
            timeout /t 2 /nobreak >nul
            goto CHECK_PORT
        ) else (
            echo [ERROR] Failed to release port 8000 after multiple attempts
            echo [INFO] Please manually close the process using port 8000
            pause
            exit /b 1
        )
    )
) else (
    echo [INFO] No running service found
)
echo.
endlocal

REM 检查是否已安装依赖
if not exist "node_modules\" (
    echo [INFO] Dependencies not found, installing...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

REM 启动服务器
echo [INFO] Starting server...
echo [INFO] Server will be available at: http://127.0.0.1:8000
echo [TIP] Press Ctrl+C to stop the server
echo.
echo ========================================
node server.js

pause
