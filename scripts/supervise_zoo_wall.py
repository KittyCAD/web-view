#!/usr/bin/env python3
"""Keep the wall controller and nine disposable display windows healthy."""

import argparse
from collections import Counter
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path


RUNTIME_DIR = Path(os.environ.get("WALL_RUNTIME_DIR", Path(__file__).resolve().parents[1]))
RELAUNCHER = RUNTIME_DIR / "scripts" / "relaunch_zoo_wall.py"
HEALTH_URL = os.environ.get("WALL_HEALTH_URL", "http://127.0.0.1:3000/api/wall-health")
CHECK_INTERVAL = max(2, int(os.environ.get("WALL_SUPERVISOR_INTERVAL", "5")))
STALE_SECONDS = max(30, int(os.environ.get("WALL_SUPERVISOR_STALE_SECONDS", "180")))
CONTROLLER_STALE_SECONDS = max(
    STALE_SECONDS,
    int(os.environ.get("WALL_SUPERVISOR_CONTROLLER_STALE_SECONDS", "600")),
)
RESTART_COOLDOWN = max(20, int(os.environ.get("WALL_SUPERVISOR_RESTART_COOLDOWN", "45")))
STARTUP_GRACE = max(15, int(os.environ.get("WALL_SUPERVISOR_STARTUP_GRACE", "40")))
CONTROLLER_RSS_LIMIT_KB = max(
    1024 * 1024,
    int(os.environ.get("WALL_CONTROLLER_RSS_LIMIT_MB", "3072")) * 1024,
)
DISPLAY = os.environ.get("DISPLAY", ":0")
XAUTHORITY = os.environ.get("XAUTHORITY", "/run/user/1000/gdm/Xauthority")


def emit(event, **values):
    print(json.dumps({
        "time": time.time(),
        "event": event,
        **values,
    }, sort_keys=True), flush=True)


def health():
    with urllib.request.urlopen(HEALTH_URL, timeout=4) as response:
        return json.loads(response.read().decode("utf-8"))


def wall_window_tile_counts():
    env = os.environ.copy()
    env.update({"DISPLAY": DISPLAY, "XAUTHORITY": XAUTHORITY})
    result = subprocess.run(
        ["wmctrl", "-lG"],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    tiles = Counter()
    for line in result.stdout.splitlines():
        marker = "Zoo Web View Wall "
        if marker not in line:
            continue
        try:
            tiles[int(line.rsplit(marker, 1)[1].strip())] += 1
        except ValueError:
            pass
    return dict(tiles)


def fresh_display_tiles(payload):
    latest = {}
    for client in payload.get("clients") or []:
        if client.get("kind") != "display":
            continue
        try:
            tile = int(client.get("tile"))
            age = float(client.get("ageSeconds"))
        except (TypeError, ValueError):
            continue
        latest[tile] = min(age, latest.get(tile, age))
    return {
        tile
        for tile, age in latest.items()
        if 0 <= tile <= 8 and age <= STALE_SECONDS
    }


def freshest_controller_age(payload):
    ages = []
    for client in payload.get("clients") or []:
        if client.get("kind") != "controller":
            continue
        try:
            ages.append(float(client.get("ageSeconds")))
        except (TypeError, ValueError):
            continue
    return min(ages) if ages else None


def controller_process_count():
    result = subprocess.run(
        ["ps", "-eo", "args="],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return sum(
        1
        for args in result.stdout.splitlines()
        if (
            "/opt/google/chrome/chrome" in args and
            "--user-data-dir=/tmp/zoo-wall-controller-profile-" in args and
            "--type=" not in args
        )
    )


def controller_rss_kb():
    result = subprocess.run(
        ["ps", "-eo", "rss=,args="],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    total = 0
    for line in result.stdout.splitlines():
        fields = line.strip().split(maxsplit=1)
        if len(fields) != 2:
            continue
        rss, args = fields
        if (
            "/opt/google/chrome/chrome" not in args or
            "--user-data-dir=/tmp/zoo-wall-controller-profile-" not in args
        ):
            continue
        try:
            total += int(rss)
        except ValueError:
            pass
    return total


def relaunch(flag):
    emit("relaunch.start", flag=flag)
    result = subprocess.run(
        ["python3", str(RELAUNCHER), flag],
        cwd=RUNTIME_DIR,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
        timeout=90,
    )
    emit(
        "relaunch.finish",
        flag=flag,
        returnCode=result.returncode,
        output=result.stdout[-4000:],
    )
    return result.returncode == 0


def run(once=False):
    started_at = time.monotonic()
    last_controller_restart = 0.0
    last_display_restart = 0.0
    while True:
        now = time.monotonic()
        try:
            payload = health()
        except (OSError, ValueError, urllib.error.URLError) as error:
            emit("server.unavailable", error=str(error))
            if once:
                return 1
            time.sleep(CHECK_INTERVAL)
            continue

        persisted_controller_age = payload.get("controllerHeartbeatAgeSeconds")
        controller_age = freshest_controller_age(payload)
        controller_processes = controller_process_count()
        controller_rss = controller_rss_kb()
        outside_grace = now - started_at >= STARTUP_GRACE
        controller_over_limit = controller_rss > CONTROLLER_RSS_LIMIT_KB
        controller_healthy = (
            isinstance(controller_age, (int, float)) and
            controller_age <= CONTROLLER_STALE_SECONDS and
            controller_processes == 1 and
            not controller_over_limit
        )
        heartbeat_tiles = fresh_display_tiles(payload)
        window_counts = wall_window_tile_counts()
        window_tiles = set(window_counts)
        displays_healthy = (
            heartbeat_tiles == set(range(9)) and
            window_counts == {tile: 1 for tile in range(9)}
        )
        emit(
            "health",
            phase=payload.get("phase"),
            revision=payload.get("stateRevision"),
            controllerAgeSeconds=controller_age,
            persistedControllerAgeSeconds=persisted_controller_age,
            controllerProcesses=controller_processes,
            controllerRssKb=controller_rss,
            controllerRssLimitKb=CONTROLLER_RSS_LIMIT_KB,
            controllerOverLimit=controller_over_limit,
            controllerStaleSeconds=CONTROLLER_STALE_SECONDS,
            displayStaleSeconds=STALE_SECONDS,
            heartbeatTiles=sorted(heartbeat_tiles),
            windowTiles=sorted(window_tiles),
            windowCounts=window_counts,
        )

        if (
            outside_grace and
            not controller_healthy and
            now - last_controller_restart >= RESTART_COOLDOWN
        ):
            last_controller_restart = now
            relaunch("--controller-only")
        if (
            outside_grace and
            not displays_healthy and
            now - last_display_restart >= RESTART_COOLDOWN
        ):
            last_display_restart = now
            relaunch("--displays-only")

        if once:
            return 0 if controller_healthy and displays_healthy else 2
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    raise SystemExit(run(once=parser.parse_args().once))
