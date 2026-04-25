$ErrorActionPreference = "Stop"

$appModule = if ($env:APP_MODULE) { $env:APP_MODULE } else { "app.main:app" }
$hostName = if ($env:HOST) { $env:HOST } else { "0.0.0.0" }
$port = if ($env:PORT) { $env:PORT } else { "8000" }

if ($env:ENVIRONMENT -eq "production") {
    gunicorn $appModule -c gunicorn_conf.py
    exit $LASTEXITCODE
}

uvicorn $appModule --host $hostName --port $port --reload
