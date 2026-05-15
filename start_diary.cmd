@echo off
setlocal

set "ROOT=%~dp0"
set "URL=http://127.0.0.1:8765"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = [System.IO.Path]::GetFullPath('%ROOT%');" ^
  "$url = '%URL%';" ^
  "$port = 8765;" ^
  "$listening = $false;" ^
  "try { $client = New-Object System.Net.Sockets.TcpClient; $iar = $client.BeginConnect('127.0.0.1', $port, $null, $null); $listening = $iar.AsyncWaitHandle.WaitOne(300); if ($client.Connected) { $client.EndConnect($iar) | Out-Null } $client.Close() } catch { $listening = $false };" ^
  "if (-not $listening) { Start-Process python -ArgumentList 'server.py' -WorkingDirectory $root -WindowStyle Hidden | Out-Null; Start-Sleep -Milliseconds 800 };" ^
  "Start-Process $url"

endlocal
