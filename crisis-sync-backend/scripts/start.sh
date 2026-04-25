#!/usr/bin/env sh
set -e

APP_MODULE="${APP_MODULE:-app.main:app}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

if [ "${ENVIRONMENT:-development}" = "production" ]; then
  exec gunicorn "$APP_MODULE" -c gunicorn_conf.py
fi

exec uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT" --reload
