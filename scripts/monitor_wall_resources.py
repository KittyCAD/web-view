#!/usr/bin/env python3
"""Append bounded wall process and GPU resource samples to JSONL."""

import argparse
import json
import os
import subprocess
import time
from pathlib import Path


INTERVAL = max(2, int(os.environ.get("WALL_RESOURCE_INTERVAL", "10")))
OUTPUT = Path(
    os.environ.get(
        "WALL_RESOURCE_LOG",
        "/home/user/web-view-wall-runtime/logs/wall-resources.jsonl",
    )
)
MAX_BYTES = max(1024 * 1024, int(os.environ.get("WALL_RESOURCE_LOG_MAX_BYTES", str(16 * 1024 * 1024))))


def command_output(command):
    try:
        return subprocess.run(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
        ).stdout
    except FileNotFoundError:
        return ""


def process_sample():
    rows = []
    output = command_output(["ps", "-eo", "pid=,ppid=,rss=,etimes=,args="])
    for line in output.splitlines():
        fields = line.strip().split(maxsplit=4)
        if len(fields) != 5:
            continue
        pid, ppid, rss, elapsed, args = fields
        if "wall_server.py" not in args and "zoo-wall-" not in args:
            continue
        try:
            rows.append({
                "pid": int(pid),
                "ppid": int(ppid),
                "rssKb": int(rss),
                "elapsedSeconds": int(elapsed),
                "args": args[:500],
            })
        except ValueError:
            pass
    return rows


def gpu_sample():
    output = command_output([
        "nvidia-smi",
        "--query-gpu=index,memory.used,memory.total,utilization.gpu",
        "--format=csv,noheader,nounits",
    ])
    result = []
    for line in output.splitlines():
        fields = [field.strip() for field in line.split(",")]
        if len(fields) != 4:
            continue
        try:
            result.append({
                "index": int(fields[0]),
                "memoryUsedMb": int(fields[1]),
                "memoryTotalMb": int(fields[2]),
                "utilizationPercent": int(fields[3]),
            })
        except ValueError:
            pass
    return result


def memory_sample():
    values = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, raw_value = line.split(":", 1)
            if key not in {"MemTotal", "MemAvailable", "SwapTotal", "SwapFree"}:
                continue
            values[f"{key[0].lower()}{key[1:]}Kb"] = int(raw_value.strip().split()[0])
    except (OSError, ValueError):
        pass
    return values


def append_sample(sample):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists() and OUTPUT.stat().st_size >= MAX_BYTES:
        backup = OUTPUT.with_suffix(OUTPUT.suffix + ".1")
        backup.unlink(missing_ok=True)
        os.replace(OUTPUT, backup)
    with OUTPUT.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(sample, sort_keys=True) + "\n")


def run(once=False):
    while True:
        processes = process_sample()
        append_sample({
            "time": time.time(),
            "processes": processes,
            "processRssKb": sum(row["rssKb"] for row in processes),
            "gpu": gpu_sample(),
            "memory": memory_sample(),
        })
        if once:
            return
        time.sleep(INTERVAL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    run(once=parser.parse_args().once)
