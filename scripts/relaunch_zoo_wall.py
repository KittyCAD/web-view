#!/usr/bin/env python3
"""Launch the Zoo wall as nine exact 3840x2160 Chrome app windows."""

import argparse
import fcntl
import os
import re
import shutil
import signal
import socket
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
XVFB = "/usr/bin/Xvfb"
BASE_URL = "http://127.0.0.1:3000"
CONTROLLER_DISPLAY = ":88"
CONTROLLER_XVFB_PID = Path("/tmp/zoo-wall-controller-xvfb.pid")
CONTROLLER_CHROME_PID = Path("/tmp/zoo-wall-controller-chrome.pid")
RELAUNCH_LOCK = Path("/tmp/zoo-wall-relaunch.lock")
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


def browser_pids(profile_marker):
    output = subprocess.run(
        ["ps", "-eo", "pid=,args="],
        text=True,
        stdout=subprocess.PIPE,
        check=True,
    ).stdout
    pids = []
    for line in output.splitlines():
        fields = line.strip().split(maxsplit=1)
        if len(fields) != 2 or profile_marker not in fields[1]:
            continue
        if "/opt/google/chrome/chrome" not in fields[1]:
            continue
        pids.append(int(fields[0]))
    return pids


def stop_existing_browsers(profile_marker):
    pids = browser_pids(profile_marker)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        remaining = browser_pids(profile_marker)
        if not remaining:
            return
        time.sleep(0.25)
    for pid in browser_pids(profile_marker):
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def stop_pid_file(path):
    try:
        pid = int(path.read_text().strip())
    except (FileNotFoundError, ValueError):
        path.unlink(missing_ok=True)
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        path.unlink(missing_ok=True)
        return
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            path.unlink(missing_ok=True)
            return
        time.sleep(0.1)
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    path.unlink(missing_ok=True)


def controller_environment():
    env = os.environ.copy()
    env.update(
        {
            "DISPLAY": CONTROLLER_DISPLAY,
            "XDG_RUNTIME_DIR": XDG_RUNTIME_DIR,
            "DBUS_SESSION_BUS_ADDRESS": DBUS_SESSION_BUS_ADDRESS,
        }
    )
    env.pop("XAUTHORITY", None)
    return env


def launch_controller(reload_id):
    stop_existing_browsers("zoo-wall-controller-profile-")
    stop_pid_file(CONTROLLER_CHROME_PID)
    stop_pid_file(CONTROLLER_XVFB_PID)

    for old in Path("/tmp").glob("zoo-wall-controller-profile-*"):
        shutil.rmtree(old, ignore_errors=True)
    for old in Path("/tmp").glob("zoo-wall-controller-cache-*"):
        shutil.rmtree(old, ignore_errors=True)

    profile = Path(f"/tmp/zoo-wall-controller-profile-{reload_id}")
    cache = Path(f"/tmp/zoo-wall-controller-cache-{reload_id}")
    profile.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    log = open("/tmp/zoo-wall-controller.log", "ab", buffering=0)
    xvfb = subprocess.Popen(
        [
            XVFB,
            CONTROLLER_DISPLAY,
            "-screen",
            "0",
            "1280x720x24",
            "-nolisten",
            "tcp",
            "-noreset",
        ],
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    CONTROLLER_XVFB_PID.write_text(f"{xvfb.pid}\n")
    display_socket = Path(f"/tmp/.X11-unix/X{CONTROLLER_DISPLAY.lstrip(':')}")
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if display_socket.exists():
            break
        if xvfb.poll() is not None:
            raise SystemExit("controller Xvfb exited before becoming ready")
        time.sleep(0.1)
    else:
        raise SystemExit("controller Xvfb did not become ready")

    url = f"{BASE_URL}/?reload={reload_id}&wallController=1"
    controller = subprocess.Popen(
        [
            CHROME,
            f"--user-data-dir={profile}",
            f"--disk-cache-dir={cache}",
            "--remote-debugging-port=9223",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-session-crashed-bubble",
            "--hide-crash-restore-bubble",
            "--disable-background-networking",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-features=Translate,AutofillServerCommunication,OptimizationHints",
            "--password-store=basic",
            "--no-proxy-server",
            "--force-device-scale-factor=1",
            "--disable-gpu",
            "--disable-accelerated-video-decode",
            "--disable-accelerated-2d-canvas",
            "--window-size=1280,720",
            f"--app={url}",
        ],
        env=controller_environment(),
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    CONTROLLER_CHROME_PID.write_text(f"{controller.pid}\n")
    log.close()
    print(f"controller_pid={controller.pid}")
    print(f"controller_profile={profile}")


def wall_window_entries(env):
    output = run(["wmctrl", "-lG"], env=env).stdout
    found = []
    pattern = re.compile(
        r"(0x[0-9a-fA-F]+)\s+\S+\s+(-?\d+)\s+(-?\d+)\s+"
        r"(\d+)\s+(\d+)\s+\S+\s+Zoo Web View Wall (\d+)$"
    )
    for line in output.splitlines():
        match = pattern.match(line)
        if match:
            found.append((int(match.group(6)), match.group(1)))
    return found


def wall_windows(env):
    return {
        tile: window_id
        for tile, window_id in wall_window_entries(env)
    }


def close_wall_windows(env):
    for _, window_id in wall_window_entries(env):
        run(["wmctrl", "-ic", window_id], env=env)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if not wall_window_entries(env):
            return
        time.sleep(0.2)


def wait_for_debug_port(port, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.2)
    raise SystemExit(f"Chrome debugging port {port} did not become ready")


def launch_displays(reload_id):
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
    profile = Path(f"/tmp/zoo-wall-chrome-profile-{reload_id}")
    cache = Path(f"/tmp/zoo-wall-chrome-cache-{reload_id}")

    stop_existing_browsers("zoo-wall-chrome-profile-")
    close_wall_windows(env)
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
        if tile == 0:
            wait_for_debug_port(9222)
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            entries = wall_window_entries(env)
            if sum(1 for found_tile, _ in entries if found_tile == tile) == 1:
                break
            time.sleep(0.2)
        else:
            raise SystemExit(f"wall tile {tile} did not open")
    log.close()

    deadline = time.time() + 30
    windows = {}
    while time.time() < deadline:
        entries = wall_window_entries(env)
        windows = wall_windows(env)
        if len(entries) == len(POSITIONS) and sorted(windows) == list(POSITIONS):
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
    entries = wall_window_entries(env)
    if len(entries) != len(POSITIONS):
        raise SystemExit(f"expected exactly 9 wall windows, found {len(entries)}")
    print(f"reload={reload_id}")
    print(f"profile={profile}")
    print(output)


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--controller-only", action="store_true")
    mode.add_argument("--displays-only", action="store_true")
    args = parser.parse_args()
    RELAUNCH_LOCK.parent.mkdir(parents=True, exist_ok=True)
    with RELAUNCH_LOCK.open("w") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        reload_id = str(int(time.time() * 1000))
        if not args.displays_only:
            launch_controller(reload_id)
        if not args.controller_only:
            launch_displays(reload_id)


if __name__ == "__main__":
    main()
