#!/usr/bin/env bash
# Run from roccky_bot/. Each launch owns a process group for graceful cleanup.
set -uo pipefail

command_to_run=(npm run start:node)
if (( $# )); then command_to_run=("$@"); fi

child_pid=''
delay=1

stop() {
    local status=$1
    trap '' TERM INT
    if [[ -n "$child_pid" ]]; then
        kill -TERM -- "-$child_pid" 2>/dev/null || true
        # Allow the bot's 12-second shutdown and launcher's 15-second deadline.
        for (( attempt=0; attempt<20; attempt++ )); do
            if ! kill -0 -- "-$child_pid" 2>/dev/null; then break; fi
            sleep 1
        done
        kill -KILL -- "-$child_pid" 2>/dev/null || true
        wait "$child_pid" 2>/dev/null || true
    fi
    exit "$status"
}

trap 'stop 143' TERM
trap 'stop 130' INT

while true; do
    started=$SECONDS
    setsid --wait "${command_to_run[@]}" &
    child_pid=$!
    wait "$child_pid"
    status=$?
    # If a launcher crashes, stop any surviving worker before replacing it.
    kill -TERM -- "-$child_pid" 2>/dev/null || true
    for (( attempt=0; attempt<20; attempt++ )); do
        if ! kill -0 -- "-$child_pid" 2>/dev/null; then break; fi
        sleep 1
    done
    kill -KILL -- "-$child_pid" 2>/dev/null || true
    child_pid=''

    case "$status" in
        0|78) exit "$status" ;;
    esac
    if (( SECONDS - started >= 60 )); then delay=1; fi
    printf 'Bot launcher exited (%s); retrying in %ss\n' "$status" "$delay" >&2
    sleep "$delay"
    delay=$(( delay < 30 ? delay * 2 : 60 ))
done
