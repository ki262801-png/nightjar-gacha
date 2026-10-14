@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul && (python server.py & goto :eof)
where py >nul 2>nul && (py -3 server.py & goto :eof)
echo 找不到 Python。請先安裝 Python 3（https://www.python.org/）再重新開啟。
pause
