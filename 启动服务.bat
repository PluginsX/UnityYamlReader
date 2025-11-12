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
start http://127.0.0.1:8000
echo [TIP] Press Ctrl+C to stop the server
echo.
node server.js
