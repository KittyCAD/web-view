#!/usr/bin/env python3
"""Launch the Zoo wall as nine exact 3840x2160 Chrome app windows."""

import os
import re
import shutil
import signal
import subprocess
import time
from pathlib import Path


DISPLAY = ":0"
XAUTHORITY_CANDIDATES = (
    "/run/user/1000/gdm/Xauthority",
    "/home/user/.Xauthority",
)
XDG_RUNTIME_DIR = "/run/user/1000"
DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/1000/bus"
CHROME = "/usr/bin/google-chrome"
BASE_URL = "http://127.0.0.1:3000"
POSITIONS = {
    0: (0, 0),
    1: (3840, 0),
    2: (7680, 0),
    3: (0, 2160),
    4: (3840, 2160),
    5: (7680, 2160),
    6: (0, 4320),
    7: (3840, 4320),
    8: (7680, 4320),
}


def run(command, *, env, check=False):
    return subprocess.run(
        command,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=check,
    )


def wall_browser_pids():
    output = subprocess.run(
        ["ps", "-eo", "pid=,args="],
        text=True,
        stdout=subprocess.PIPE,
        check=True,
    ).stdout
    pids = []
    for line in output.splitlines():
        fields = line.strip().split(maxsplit=1)
        if len(fields) != 2 or "zoo-wall-chrome-profile-" not in fields[1]:
            continue
        if "/opt/google/chrome/chrome" not in fields[1]:
            continue
        pids.append(int(fields[0]))
    return pids


def stop_existing_wall_browsers():
    pids = wall_browser_pids()
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        remaining = wall_browser_pids()
        if not remaining:
            return
        time.sleep(0.25)
    for pid in wall_browser_pids():
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def wall_windows(env):
    output = run(["wmctrl", "-lG"], env=env).stdout
    found = {}
    pattern = re.compile(
        r"(0x[0-9a-fA-F]+)\s+\S+\s+(-?\d+)\s+(-?\d+)\s+"
        r"(\d+)\s+(\d+)\s+\S+\s+Zoo Web View Wall (\d+)$"
    )
    for line in output.splitlines():
        match = pattern.match(line)
        if match:
            found[int(match.group(6))] = match.group(1)
    return found


def main():
    env = os.environ.copy()
    xauthority = next(
        (path for path in XAUTHORITY_CANDIDATES if Path(path).exists()),
        XAUTHORITY_CANDIDATES[0],
    )
    env.update(
        {
            "DISPLAY": DISPLAY,
            "XAUTHORITY": xauthority,
            "XDG_RUNTIME_DIR": XDG_RUNTIME_DIR,
            "DBUS_SESSION_BUS_ADDRESS": DBUS_SESSION_BUS_ADDRESS,
        }
    )
    reload_id = str(int(time.time() * 1000))
    profile = Path(f"/tmp/zoo-wall-chrome-profile-{reload_id}")
    cache = Path(f"/tmp/zoo-wall-chrome-cache-{reload_id}")

    stop_existing_wall_browsers()
    subprocess.run(
        ["pkill", "-x", "apport-gtk"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(2)

    for old in Path("/tmp").glob("zoo-wall-chrome-profile-*"):
        shutil.rmtree(old, ignore_errors=True)
    for old in Path("/tmp").glob("zoo-wall-chrome-cache-*"):
        shutil.rmtree(old, ignore_errors=True)
    profile.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)

    log = open("/tmp/zoo-wall-chrome.log", "wb", buffering=0)
    common = [
        CHROME,
        f"--user-data-dir={profile}",
        f"--disk-cache-dir={cache}",
        "--remote-debugging-port=9222",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
        "--hide-crash-restore-bubble",
        "--disable-background-networking",
        "--disable-features=Translate,AutofillServerCommunication,OptimizationHints",
        "--password-store=basic",
        "--no-proxy-server",
        "--force-device-scale-factor=1",
        "--disable-gpu",
        "--disable-accelerated-video-decode",
        "--disable-accelerated-2d-canvas",
    ]
    for tile, (x, y) in POSITIONS.items():
        url = f"{BASE_URL}/?reload={reload_id}&wallTile={tile}"
        subprocess.Popen(
            common
            + [
                f"--window-position={x},{y}",
                "--window-size=3840,2160",
                f"--app={url}",
            ],
            env=env,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
        time.sleep(0.45)
    log.close()

    deadline = time.time() + 30
    windows = {}
    while time.time() < deadline:
        windows = wall_windows(env)
        if sorted(windows) == list(POSITIONS):
            break
        time.sleep(0.5)

    for _ in range(2):
        for tile, window_id in sorted(windows.items()):
            x, y = POSITIONS[tile]
            run(
                ["wmctrl", "-ir", window_id, "-b", "remove,fullscreen,maximized_vert,maximized_horz"],
                env=env,
            )
            run(
                ["wmctrl", "-ir", window_id, "-e", f"0,{x},{y},3840,2160"],
                env=env,
            )
            run(["wmctrl", "-ir", window_id, "-b", "add,fullscreen,above"], env=env)
        time.sleep(0.8)
        windows = wall_windows(env)

    output = run(["wmctrl", "-lG"], env=env).stdout
    for line in output.splitlines():
        if "Software Updater" in line:
            run(["wmctrl", "-ic", line.split()[0]], env=env)

    if sorted(windows) != list(POSITIONS):
        raise SystemExit(f"expected wall tiles 0-8, found {sorted(windows)}")
    print(f"reload={reload_id}")
    print(f"profile={profile}")
    print(output)


if __name__ == "__main__":
    main()
