@echo off

:: Unity Prefab Reader 启动脚本
:: 功能：一键启动Web服务并打开浏览器

cls
echo ===================================================
echo           Unity Prefab Reader 启动器
 echo ===================================================
echo 正在启动Web服务...
echo 

:: 检查Python是否安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到Python。请先安装Python并确保添加到系统环境变量。
    echo 您可以从 https://www.python.org/ 下载并安装
    echo.
    echo 按任意键退出...
    pause >nul
    exit /b 1
)

:: 设置工作目录为脚本所在目录
cd /d "%~dp0"

:: 启动Python服务器
echo 正在启动Python HTTP服务器...
echo 
echo 提示：
echo 1. 服务启动后会自动打开浏览器
 echo 2. 在浏览器中可以导入和解析.prefab文件
 echo 3. 按 Ctrl+C 可以停止服务
 echo 4. 局域网内的其他设备也可以访问此服务
 echo 

:: 运行Python脚本
python start_server.py

:: 等待用户按键后退出
echo 服务已停止
echo 按任意键退出...
pause >nul