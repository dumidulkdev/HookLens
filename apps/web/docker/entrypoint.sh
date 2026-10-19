#!/bin/sh
set -eu

nginx -t
nginx -g 'daemon off;' &
nginx_pid=$!
trap 'nginx -s quit 2>/dev/null || true; wait "$nginx_pid"' INT TERM

attempt=0
while [ "$attempt" -lt 30 ]; do
  if wget -q -O /dev/null http://127.0.0.1/; then
    printf '[WEB] [READY] Serving http://localhost:5173\n'
    wait "$nginx_pid"
    exit $?
  fi
  if ! kill -0 "$nginx_pid" 2>/dev/null; then
    wait "$nginx_pid"
    exit $?
  fi
  attempt=$((attempt + 1))
  sleep 1
done

printf '[WEB] [ERROR] Nginx did not become ready within 30 seconds.\n' >&2
nginx -s quit 2>/dev/null || true
wait "$nginx_pid" || true
exit 1
