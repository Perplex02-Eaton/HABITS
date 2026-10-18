@echo off
rem Lanza el agente local de JARVIS sin dejar consola abierta.
rem Uso: scripts\jarvis-agent.bat  [--port 8877] [--verbose] [--selftest]
setlocal
cd /d "%~dp0.."
set PY=pythonw
where pythonw >nul 2>nul || set PY=python
start "" "%PY%" "%~dp0jarvis_agent.py" %*
endlocal
