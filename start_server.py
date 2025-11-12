#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unity Prefab Reader Web服务启动脚本
功能：自动启动Python HTTP服务，支持局域网访问
"""

import os
import sys
import socket
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import time


def get_local_ip():
    """获取本地局域网IP地址"""
    try:
        # 创建一个UDP套接字来获取本机IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # 不实际发送数据，但连接到一个公网地址来获取本机IP
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception as e:
        print(f"获取本地IP时出错: {e}")
        return "127.0.0.1"


def run_server(host='0.0.0.0', port=8000):
    """启动HTTP服务器"""
    handler = SimpleHTTPRequestHandler
    httpd = HTTPServer((host, port), handler)
    
    print("========================================")
    print("Unity Prefab Reader Web服务已启动!")
    print(f"本地访问地址: http://127.0.0.1:{port}")
    
    # 获取并显示本地局域网IP地址
    local_ip = get_local_ip()
    print(f"局域网访问地址: http://{local_ip}:{port}")
    print("========================================")
    print("提示:")
    print("1. 在浏览器中打开上述地址访问Prefab Reader工具")
    print("2. 局域网内的其他设备可以通过第二个地址访问")
    print("3. 按 Ctrl+C 停止服务")
    print("========================================")
    
    try:
        # 自动在默认浏览器中打开本地地址
        webbrowser.open(f'http://127.0.0.1:{port}')
        # 启动服务器
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n正在停止服务器...")
        httpd.shutdown()
        print("服务器已停止")


def check_port_available(port):
    """检查端口是否可用"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('localhost', port))
        s.close()
        return True
    except OSError:
        return False


def find_available_port(start_port=8000, max_attempts=10):
    """查找可用端口"""
    for port in range(start_port, start_port + max_attempts):
        if check_port_available(port):
            return port
    return None


def main():
    # 确保在正确的目录下运行
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print(f"当前工作目录: {os.getcwd()}")
    print("正在检查端口可用性...")
    
    # 尝试默认端口8000，如果被占用则查找可用端口
    port = find_available_port(8000)
    if port is None:
        print("错误: 无法找到可用端口，请检查是否有其他程序占用了端口")
        sys.exit(1)
    
    # 如果端口不是默认的8000，提示用户
    if port != 8000:
        print(f"注意: 默认端口8000已被占用，将使用端口 {port}")
    
    # 启动服务器
    run_server(port=port)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"启动服务时出错: {e}")
        print("按任意键退出...")
        input()
        sys.exit(1)