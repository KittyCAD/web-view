#!/usr/bin/env python3
import base64
import binascii
import hashlib
import json
import mimetypes
import os
import queue
import re
import socket
import ssl
import struct
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("PORT", "3000"))
PUBLIC_DIR = Path(os.environ.get("WALL_PUBLIC_DIR", Path.cwd() / "public")).resolve()
WALL_AGENTS_MD = Path(os.environ.get("WALL_AGENTS_MD", Path(__file__).resolve().parents[1] / "AGENTS.md")).resolve()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
OPENAI_PLANNER_MODEL = os.environ.get("OPENAI_ARCHITECT_MODEL") or os.environ.get("OPENAI_PLANNER_MODEL", "gpt-5.5")
OPENAI_ARCHITECT_REASONING_EFFORT = os.environ.get("OPENAI_ARCHITECT_REASONING_EFFORT", "medium")
ZOO_API_TOKEN = os.environ.get("ZOO_API_TOKEN")
ZOO_WS_HOST = os.environ.get("ZOO_WS_HOST", "api.zoo.dev")
ZOO_WS_PATH = os.environ.get("ZOO_WS_PATH", "/ws/ml/copilot")
ROOT_AGENT_ID = "zookeeper-orchestrator-root"
ROOT_FILE_PATH = "main.kcl"
WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
EVENT_QUEUES = {}
EVENT_QUEUES_LOCK = threading.Lock()
LOG_DIR = Path(os.environ.get("WALL_LOG_DIR", Path.cwd() / "logs")).resolve()
EVENT_LOG_PATH = Path(os.environ.get("WALL_EVENT_LOG", LOG_DIR / "wall-events.jsonl")).resolve()
TRACE_DIR = Path(os.environ.get("WALL_TRACE_DIR", LOG_DIR / "traces")).resolve()
SNAPSHOT_DIR = Path(os.environ.get("WALL_SNAPSHOT_DIR", PUBLIC_DIR / "snapshots")).resolve()
MAX_SNAPSHOT_BYTES = int(os.environ.get("WALL_MAX_SNAPSHOT_BYTES", str(16 * 1024 * 1024)))
WALL_MAX_AGENTS = max(1, int(os.environ.get("WALL_MAX_AGENTS", "48")))
LOG_LOCK = threading.Lock()

COLORS = [
    "#00A3FF",
    "#FF4F8B",
    "#F5C542",
    "#44D07B",
    "#C084FC",
    "#FF8A3D",
    "#2DD4BF",
    "#94A3B8",
    "#F97316",
    "#22C55E",
    "#38BDF8",
    "#E879F9",
]

TOP_LEVEL_ROLES = [
    "combustion sub-assembly",
    "feed system sub-assembly",
    "structure and controls",
    "nozzle and plume shaping",
    "regen cooling system",
    "thrust vector control",
    "instrumentation harness",
    "mounting and ground support",
]

NESTED_ROLES = [
    "injector face decomposition",
    "turbopump integration",
    "cooling channel recursion",
    "nozzle extension recursion",
    "sensor package recursion",
    "mount load-path recursion",
]

WORKER_ROLES = [
    "chamber liner",
    "nozzle contour",
    "injector plate",
    "fuel valve block",
    "oxidizer valve block",
    "turbopump package",
    "thrust frame",
    "sensor harness",
    "regen cooling jacket",
    "film cooling slots",
    "igniter boss",
    "pressure transducer port",
    "gimbal ring",
    "actuator clevis",
    "mounting flange",
    "purge manifold",
    "thermal shield",
    "bell extension",
    "flex line bracket",
    "controller enclosure",
    "cable strain relief",
    "valve actuator housing",
    "interface adapter",
    "hot-fire test lug",
    "seal groove",
    "flow straightener",
    "swirl element",
    "bolt circle",
    "coolant inlet",
    "coolant outlet",
    "inspection window",
    "support strut",
    "instrument rail",
    "connector plate",
    "drain fitting",
    "assembly datum target",
]


def fmt(value):
    return round(float(value), 3)


def clamp(value, minimum, maximum):
    return min(maximum, max(minimum, value))


def sanitize_text(value, fallback):
    text = re.sub(r"\s+", " ", str(value or fallback)).strip()
    return (text or fallback)[:220]


def sanitize_dialog_text(value, fallback):
    """Keep the hosted Zookeeper's reasoning intact for the wall feed."""
    text = re.sub(r"\s+", " ", str(value or fallback)).strip()
    return text or fallback


def sanitize_scope(value, kind):
    scope = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    if scope in {"shared", "shared_part", "library", "library_part", "reusable", "reusable_part"}:
        return "shared_part"
    if kind == "orchestrator":
        return "assembly"
    return "part"


def slug(value):
    text = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return (text or "agent")[:48]


def color_for(value):
    digest = hashlib.sha1(str(value).encode("utf-8")).digest()
    return COLORS[digest[0] % len(COLORS)]


def alias_for_file_path(file_path):
    parts = re.sub(r"\.kcl$", "", str(file_path)).split("/")
    text = re.sub(r"[^a-zA-Z0-9]+", " ", parts[-1] if parts else "part").strip()
    if not text:
        return "part"
    words = text.split()
    alias = words[0].lower() + "".join(word[:1].upper() + word[1:] for word in words[1:])
    if re.match(r"^[0-9]", alias):
        alias = f"part{alias}"
    return alias


def render_path_for_file_path(file_path):
    if str(file_path) == ROOT_FILE_PATH:
        return ROOT_FILE_PATH
    return Path(str(file_path)).name or str(file_path)


def main_file_for(file_paths):
    return "".join(
        f'import "{render_path_for_file_path(file_path)}" as {alias_for_file_path(file_path)}\n'
        for file_path in file_paths
    )


def unique_list(values):
    seen = set()
    result = []
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def utc_timestamp():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def clip_for_log(value, max_string=100000):
    if isinstance(value, str):
        if len(value) <= max_string:
            return value
        return value[:max_string] + f"\n... <truncated {len(value) - max_string} chars>"
    if isinstance(value, list):
        return [clip_for_log(item, max_string) for item in value]
    if isinstance(value, dict):
        return {str(key): clip_for_log(item, max_string) for key, item in value.items()}
    return value


def log_event(kind, payload):
    event = {
        "ts": utc_timestamp(),
        "pid": os.getpid(),
        "kind": kind,
        **payload,
    }
    try:
        EVENT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_LOCK:
            with EVENT_LOG_PATH.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(event, sort_keys=True) + "\n")
    except OSError:
        pass


def write_trace_file(prefix, payload):
    trace_id = f"{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-{uuid.uuid4().hex[:10]}"
    path = TRACE_DIR / f"{prefix}-{trace_id}.json"
    TRACE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clip_for_log(payload), indent=2, sort_keys=True), encoding="utf-8")
    return str(path)


def persist_snapshot(body):
    agent_id = sanitize_text(body.get("agentId"), "agent")
    data_url = str(body.get("dataUrl") or "")
    match = re.fullmatch(r"data:image/webp;base64,([A-Za-z0-9+/=]+)", data_url)
    if match is None:
        raise RuntimeError("snapshot must be a base64 WebP data URL")

    try:
        image_bytes = base64.b64decode(match.group(1), validate=True)
    except (ValueError, binascii.Error) as error:
        raise RuntimeError(f"snapshot data is not valid base64: {error}") from error

    if not image_bytes or len(image_bytes) > MAX_SNAPSHOT_BYTES:
        raise RuntimeError(f"snapshot size must be between 1 and {MAX_SNAPSHOT_BYTES} bytes")

    filename = f"{slug(agent_id)}.webp"
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    destination = (SNAPSHOT_DIR / filename).resolve()
    try:
        destination.relative_to(SNAPSHOT_DIR)
    except ValueError as error:
        raise RuntimeError("invalid snapshot destination") from error

    temporary = SNAPSHOT_DIR / f".{filename}.{uuid.uuid4().hex}.tmp"
    temporary.write_bytes(image_bytes)
    os.replace(temporary, destination)
    revision = hashlib.sha1(image_bytes).hexdigest()[:12]
    log_event("snapshot.saved", {
        "agentId": agent_id,
        "bytes": len(image_bytes),
        "path": str(destination),
        "revision": revision,
    })
    return {"url": f"/snapshots/{urllib.parse.quote(filename)}?v={revision}"}


def json_size(value):
    try:
        return len(json.dumps(value))
    except (TypeError, ValueError):
        return -1


def review_metrics(body):
    agent = body.get("agent") if isinstance(body, dict) else {}
    child = body.get("child") if isinstance(body, dict) else {}
    files = body.get("files") if isinstance(body, dict) else {}
    interfaces = body.get("interfaces") if isinstance(body, dict) else {}
    children = body.get("children") if isinstance(body, dict) else []
    all_agents = body.get("allAgents") if isinstance(body, dict) else []
    file_items = files.items() if isinstance(files, dict) else []
    interface_items = interfaces.items() if isinstance(interfaces, dict) else []
    return {
        "sessionId": sanitize_text(body.get("sessionId"), "") if isinstance(body, dict) else "",
        "agentId": sanitize_text(agent.get("id"), "") if isinstance(agent, dict) else "",
        "agentRole": sanitize_text(agent.get("role"), "") if isinstance(agent, dict) else "",
        "agentFile": sanitize_text(agent.get("filePath"), "") if isinstance(agent, dict) else "",
        "childId": sanitize_text(child.get("id"), "") if isinstance(child, dict) else "",
        "childRole": sanitize_text(child.get("role"), "") if isinstance(child, dict) else "",
        "childFile": sanitize_text(child.get("filePath"), "") if isinstance(child, dict) else "",
        "childrenCount": len(children) if isinstance(children, list) else 0,
        "allAgentsCount": len(all_agents) if isinstance(all_agents, list) else 0,
        "fileCount": len(files) if isinstance(files, dict) else 0,
        "fileBytes": sum(len(str(contents)) for _, contents in file_items),
        "largestFileBytes": max([len(str(contents)) for _, contents in file_items] or [0]),
        "largestFile": max(file_items, key=lambda item: len(str(item[1])))[0] if isinstance(files, dict) and files else "",
        "interfaceCount": len(interfaces) if isinstance(interfaces, dict) else 0,
        "interfaceBytes": sum(len(str(contents)) for _, contents in interface_items),
        "requestJsonBytes": json_size(body),
    }


def wall_agents_instruction():
    try:
        content = WALL_AGENTS_MD.read_text(encoding="utf-8").strip()
    except OSError:
        return ""
    if not content:
        return ""
    return "\n".join([
        "Wall-run local AGENTS.md instructions:",
        content[:5000],
    ])


def rewrite_import_paths_for_render(kcl, file_paths):
    text = str(kcl or "")
    for file_path in sorted((str(path) for path in file_paths), key=len, reverse=True):
        text = text.replace(f'"{file_path}"', f'"{render_path_for_file_path(file_path)}"')
    return text


def render_files_for_zookeeper(files):
    if not isinstance(files, dict):
        return {}
    file_paths = [str(path) for path in files.keys()]
    return {
        render_path_for_file_path(path): rewrite_import_paths_for_render(contents, file_paths)
        for path, contents in files.items()
        if str(path).endswith(".kcl")
    }


def format_interface_context(raw_interfaces, max_items=80):
    if not isinstance(raw_interfaces, dict) or not raw_interfaces:
        return ""
    lines = []
    for file_path, manifest in sorted(raw_interfaces.items(), key=lambda item: str(item[0]))[:max_items]:
        text = str(manifest or "").strip()
        if not text:
            continue
        lines.append(f"- {render_path_for_file_path(file_path)} ({file_path})")
        for line in text.splitlines()[:18]:
            clean = re.sub(r"\s+", " ", line).strip()
            if clean:
                lines.append(f"  {clean[:260]}")
    return "\n".join(lines)[:12000]


def extract_import_lines(kcl):
    return "\n".join(
        line for line in str(kcl or "").splitlines()
        if line.strip().startswith("import ")
    )


def strip_import_lines(kcl):
    return "\n".join(
        line for line in str(kcl or "").splitlines()
        if not line.strip().startswith("import ")
    )


def strip_markdown_fences(value):
    text = str(value or "").strip()
    text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def clean_model_kcl(value):
    return f"{strip_import_lines(strip_markdown_fences(value)).strip()}\n"


def attach_imports(imports, body_kcl):
    clean_body = str(body_kcl or "").strip()
    if not imports.strip():
        return f"{clean_body}\n"
    return f"{imports.strip()}\n\n{clean_body}\n"


def kcl_sanity_error(kcl):
    text = str(kcl or "")
    forbidden = [
        "```",
        "import ",
        "function ",
        "fn ",
        "for ",
        "while ",
        "return ",
        "export ",
    ]
    for token in forbidden:
        if token in text:
            return f"contains unsupported token {token.strip()}"
    required = ["startSketchOn", "startProfile", "line(end =", "close()", "extrude", "appearance"]
    for token in required:
        if token not in text:
            return f"missing required KCL primitive {token}"
    if not re.search(r'#[0-9a-fA-F]{6}', text):
        return "missing hex appearance color"
    return None


def create_worker_kcl(index, role, color, scale=1.0):
    width = fmt((1.35 + (index % 6) * 0.22) * scale)
    height = fmt((0.95 + (index % 5) * 0.16) * scale)
    length = fmt((1.0 + index * 0.09) * scale)
    left = fmt(-width / 2)
    bottom = fmt(-height / 2)
    cap_width = fmt(width * 0.48)
    cap_height = fmt(height * 0.22)
    cap_y = fmt(height * 0.18)
    return f"""
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [{left}, {bottom}])
  |> line(end = [{width}, 0])
  |> line(end = [0, {height}])
  |> line(end = [{fmt(-width)}, 0])
  |> close()
extrude001 = extrude(profile001, length = {length})
  |> appearance(color="{color}")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [{fmt(-cap_width / 2)}, {cap_y}])
  |> line(end = [{cap_width}, 0])
  |> line(end = [0, {cap_height}])
  |> line(end = [{fmt(-cap_width)}, 0])
  |> close()
extrude002 = extrude(profile002, length = {fmt(length + 0.28)})
  |> appearance(color="#F8FAFC")
""".lstrip()


def create_orchestrator_kcl(index, role, color, scale=1.0):
    width = fmt((4.2 + index * 0.14) * scale)
    height = fmt((2.2 + index * 0.08) * scale)
    depth = fmt((0.55 + (index % 4) * 0.14) * scale)
    tower = fmt((1.2 + index * 0.08) * scale)
    left = fmt(-width / 2)
    bottom = fmt(-height / 2)
    rib_x = fmt(-width / 4)
    pod_x = fmt(width / 4 - 0.55 * scale)
    return f"""
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [{left}, {bottom}])
  |> line(end = [{width}, 0])
  |> line(end = [0, {height}])
  |> line(end = [{fmt(-width)}, 0])
  |> close()
extrude001 = extrude(profile001, length = {depth})
  |> appearance(color="{color}")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [{rib_x}, {fmt(-height / 3)}])
  |> line(end = [{fmt(0.82 * scale)}, 0])
  |> line(end = [0, {fmt(height * 0.66)}])
  |> line(end = [{fmt(-0.82 * scale)}, 0])
  |> close()
extrude002 = extrude(profile002, length = {tower})
  |> appearance(color="#F8FAFC")

sketch003 = startSketchOn(XY)
profile003 = startProfile(sketch003, at = [{pod_x}, {fmt(-height / 4)}])
  |> line(end = [{fmt(1.1 * scale)}, 0])
  |> line(end = [0, {fmt(height / 2)}])
  |> line(end = [{fmt(-1.1 * scale)}, 0])
  |> close()
extrude003 = extrude(profile003, length = {fmt(tower + 0.45 * scale)})
  |> appearance(color="{color}")
""".lstrip()


def create_root_kcl():
    return """
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [-4.4, -2.1])
  |> line(end = [8.8, 0])
  |> line(end = [0, 4.2])
  |> line(end = [-8.8, 0])
  |> close()
extrude001 = extrude(profile001, length = 0.5)
  |> appearance(color="#F8FAFC")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [-3.5, -1.25])
  |> line(end = [1.15, 0])
  |> line(end = [0, 2.5])
  |> line(end = [-1.15, 0])
  |> close()
extrude002 = extrude(profile002, length = 2.3)
  |> appearance(color="#00A3FF")

sketch003 = startSketchOn(XY)
profile003 = startProfile(sketch003, at = [-0.55, -1.35])
  |> line(end = [1.1, 0])
  |> line(end = [0, 2.7])
  |> line(end = [-1.1, 0])
  |> close()
extrude003 = extrude(profile003, length = 3.4)
  |> appearance(color="#44D07B")

sketch004 = startSketchOn(XY)
profile004 = startProfile(sketch004, at = [2.35, -1.05])
  |> line(end = [1.3, 0])
  |> line(end = [0, 2.1])
  |> line(end = [-1.3, 0])
  |> close()
extrude004 = extrude(profile004, length = 2.8)
  |> appearance(color="#FF4F8B")
""".lstrip()


def fallback_agents(max_agents):
    seeds = []
    orchestrator_ids = []
    for index, role in enumerate(TOP_LEVEL_ROLES, start=1):
        agent_id = f"sub-orchestrator-{index:04d}"
        orchestrator_ids.append(agent_id)
        seeds.append({
            "id": agent_id,
            "parentId": ROOT_AGENT_ID,
            "kind": "orchestrator",
            "name": f"Zookeeper Sub-Orchestrator {index:04d}",
            "role": role,
            "instruction": f"Break down and coordinate the {role} for the assembly. Merge child KCL outputs into this sub-assembly.",
            "filePath": f"generated/{agent_id}.kcl",
            "scope": "assembly",
            "imports": [],
            "source": "fallback",
        })
    offset = len(TOP_LEVEL_ROLES)
    for index, role in enumerate(NESTED_ROLES, start=1):
        number = offset + index
        agent_id = f"sub-orchestrator-{number:04d}"
        orchestrator_ids.append(agent_id)
        seeds.append({
            "id": agent_id,
            "parentId": orchestrator_ids[(index - 1) % len(TOP_LEVEL_ROLES)],
            "kind": "orchestrator",
            "name": f"Zookeeper Sub-Orchestrator {number:04d}",
            "role": role,
            "instruction": f"Recursively decompose {role}. Request worker KCL for concrete parts and maintain a renderable assembly file.",
            "filePath": f"generated/{agent_id}.kcl",
            "scope": "assembly",
            "imports": [],
            "source": "fallback",
        })
    for index, role in enumerate(WORKER_ROLES, start=1):
        agent_id = f"worker-{index:04d}"
        seeds.append({
            "id": agent_id,
            "parentId": orchestrator_ids[(index - 1) % len(orchestrator_ids)],
            "kind": "worker",
            "name": f"Zookeeper Worker {index:04d}",
            "role": role,
            "instruction": f"Produce clean, renderable KCL for the {role}. Keep the part simple enough to update quickly in the wall renderer.",
            "filePath": f"generated/{agent_id}.kcl",
            "scope": "part",
            "imports": [],
            "source": "fallback",
        })
    return seeds[:max_agents]


def build_files(agents):
    files = {}
    top_level_files = [
        agent["filePath"] for agent in agents
        if agent["parentId"] == ROOT_AGENT_ID and not is_reusable_library_agent(agent)
    ]
    root_import_files = unique_list([
        *top_level_files,
        *[
            import_path
            for agent in agents
            if agent["parentId"] == ROOT_AGENT_ID and not is_reusable_library_agent(agent)
            for import_path in agent.get("imports", [])
        ],
    ])
    files[ROOT_FILE_PATH] = main_file_for(root_import_files)
    for agent in agents:
        if is_reusable_library_agent(agent):
            files[agent["filePath"]] = bom_library_file(
                agent,
                [child for child in agents if child["parentId"] == agent["id"]],
            )
            continue
        child_files = [
            child["filePath"] for child in agents
            if child["parentId"] == agent["id"] and not is_reusable_library_agent(child)
        ]
        files[agent["filePath"]] = main_file_for(unique_list([*child_files, *agent.get("imports", [])]))
    return files


def is_reusable_library_agent(agent):
    return (
        str(agent.get("kind")) == "orchestrator"
        and re.search(r"\b(shared|reusable|library|catalog|standard)\b", str(agent.get("role") or ""), re.I)
    )


def bom_library_file(agent, children):
    lines = [
        "// ZOOKEEPER_BOM_LIBRARY",
        "// Metadata-only shared component registry for the wall run.",
        "// This file is not imported into renderable assemblies.",
        f"// role: {sanitize_text(agent.get('role'), 'reusable component library')}",
    ]
    for child in children:
        lines.extend([
            f"// component: {sanitize_text(child.get('role'), 'shared component')}",
            f"// file: {sanitize_text(child.get('filePath'), '')}",
            f"// scope: {sanitize_text(child.get('scope'), '')}",
        ])
    lines.extend(["// /ZOOKEEPER_BOM_LIBRARY", ""])
    return "\n".join(lines)


def fallback_plan(prompt, max_agents, note):
    agents = fallback_agents(max_agents)
    return {
        "sessionId": f"fallback-{int(time.time() * 1000)}",
        "source": "fallback",
        "prompt": prompt,
        "root": {
            "instruction": f"Plan and merge a renderable assembly for: {prompt}",
            "filePath": ROOT_FILE_PATH,
        },
        "agents": agents,
        "files": build_files(agents),
        "notes": [note],
    }


PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "assembly_title": {"type": "string"},
        "root_instruction": {"type": "string"},
        "agents": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "key": {"type": "string"},
                    "parent_key": {"type": "string"},
                    "kind": {"type": "string", "enum": ["orchestrator", "worker"]},
                    "scope": {"type": "string", "enum": ["assembly", "part", "shared_part"]},
                    "role": {"type": "string"},
                    "instruction": {"type": "string"},
                    "imports": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["key", "parent_key", "kind", "scope", "role", "instruction", "imports"],
            },
        },
    },
    "required": ["assembly_title", "root_instruction", "agents"],
}

WORK_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "kcl": {"type": "string"},
    },
    "required": ["summary", "kcl"],
}

SUB_BOM_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "children": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "key": {"type": "string"},
                    "kind": {"type": "string", "enum": ["orchestrator", "worker"]},
                    "scope": {"type": "string", "enum": ["assembly", "part", "shared_part"]},
                    "role": {"type": "string"},
                    "instruction": {"type": "string"},
                    "imports": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["key", "kind", "scope", "role", "instruction", "imports"],
            },
        },
    },
    "required": ["summary", "children"],
}


PLAN_JSON_SHAPE = (
    '{"assembly_title":"short title","root_instruction":"parent orchestrator instruction",'
    '"agents":[{"key":"stable_snake_case_key","parent_key":"root or another orchestrator key",'
    '"kind":"orchestrator or worker","scope":"assembly, part, or shared_part",'
    '"role":"short physical role","instruction":"specific work instruction with interfaces and dimensions",'
    '"imports":["other agent keys to import"]}]}'
)

SUB_BOM_JSON_SHAPE = (
    '{"summary":"short delegation summary",'
    '"children":[{"key":"stable_local_key","kind":"orchestrator or worker",'
    '"scope":"assembly, part, or shared_part","role":"short physical role",'
    '"instruction":"specific work instruction with interfaces and dimensions",'
    '"imports":["known shared component role or existing agent key"]}]}'
)


def planner_instructions(agents_instruction, root_only=False):
    return " ".join([
        "You are the parent Zookeeper Orchestrator for a CAD wall demo.",
        agents_instruction,
        "Create a nested plan of sub-orchestrators and workers for the requested assembly.",
        "Use parent_key root for top-level sub-orchestrators.",
        "Choose the number of agents that fits the requested assembly instead of filling the maximum.",
        "For moderately complex mechanical assemblies, prefer roughly 15 to 25 agents unless the prompt clearly needs fewer or more.",
        "When a maximum agent count is provided, do not exceed it; otherwise choose the scale that the requested assembly requires.",
        "There is no fixed maximum BOM depth. Nest sub-orchestrators whenever a subsystem has independent interfaces or placement responsibility; stop only at concrete part workers.",
        "For assemblies with 15 or more agents, use a genuine hierarchy rather than a flat fan-out. Three levels is a minimum useful pattern, not a cap; use additional levels for meaningful sub-assemblies.",
        "Use 2 to 5 top-level sub-assembly orchestrators for major physical systems, then let each system choose its own focused subsystems and part workers.",
        "Workers should own concrete CAD parts. Orchestrators should own sub-assemblies and placement.",
        "Part workers should be children of leaf sub-assembly orchestrators. Do not put ordinary part workers directly under root or directly under broad top-level sub-assemblies when leaf sub-orchestrators exist.",
        "Top-level sub-assembly orchestrators should mostly contain child sub-orchestrators, not a long flat list of individual part workers.",
        "Every non-shared worker must have parent_key set to the exact key of the most specific orchestrator that owns it; do not put ordinary workers directly under root.",
        "Every orchestrator should have at least one direct child worker or sub-orchestrator unless it is only a reusable component library.",
        "Every non-library top-level orchestrator should have at least one nested sub-orchestrator when the requested assembly has 15 or more agents.",
        "Treat symmetry and repetition as orchestrator-owned assembly placement. The architect may plan mirrored left/right placements, radial patterns, and linear patterns, but should express those in orchestrator instructions instead of asking workers to make 'sets'.",
        "When a repeated part is geometrically identical, create one canonical worker and instruct the consuming orchestrator to clone and place it with explicit translate/rotate/scale transforms. Create separate handed workers only when the geometry is genuinely chiral or has different manufacturing features.",
        "For pattern-heavy features such as bolt circles, rails, paired fins, mirrored brackets, repeated ribs, rollers, bearings, pins, or washers, keep one shared/canonical part file and put count, spacing, angle, mirror plane, symmetry axis, and mate-point context in the orchestrator instruction.",
        "A reusable component library is BOM/catalog metadata only; it must not be visualized as an assembly and should not arrange reusable parts together.",
        "Use scope=shared_part for reusable primitive hardware that should exist once and be imported/cloned by multiple assemblies: bolt, screw, washer, pin, bushing, bearing, spacer, nut, clip, etc.",
        "Shared part workers must be singular canonical files such as role='M4 socket head bolt' or role='flanged bearing', never role='bolt set', 'fastener set', 'hardware pack', or a KCL file containing many repeated instances.",
        "If several sub-assemblies need the same shared part, list that shared part worker key in each consuming orchestrator's imports array. The orchestrator places repeated instances with clone/translate/rotate; the shared worker only models one reusable part.",
        "Use imports for shared component reuse and for cross-subassembly references. Imports must contain agent keys, not file paths.",
        "Each instruction should include concrete dimensional/interface context: local axes, expected mate points, neighboring parts, and what the parent orchestrator expects back.",
        "Keep roles short, physical, and suitable as graph labels.",
        *([
            "This is the root architect turn. Return only the top-level sub-assembly orchestrators and an optional metadata-only reusable component library.",
            "Do not enumerate leaf sub-orchestrators or workers here. Each top-level sub-orchestrator will independently plan its direct BOM in a concurrent hosted Zoo turn.",
            "Every returned non-library agent must be an assembly orchestrator with parent_key root.",
        ] if root_only else []),
    ])


def planner_input(prompt, max_agents):
    maximum_agents = (
        f"Maximum agents: {max_agents}"
        if max_agents is not None
        else "Maximum agents: none; choose the number required for a coherent, nested assembly."
    )
    return "\n".join([
        f"Prompt: {prompt}",
        maximum_agents,
        "Return JSON only. Do not wrap it in markdown.",
        "Required JSON shape:",
        PLAN_JSON_SHAPE,
    ])


def output_text(data):
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    chunks = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            if isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks)


def openai_json(name, schema, instructions, input_text, model=None, reasoning_effort=None, timeout=90):
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")
    payload = {
        "model": model or OPENAI_MODEL,
        "instructions": instructions,
        "input": input_text,
        "text": {
            "format": {
                "type": "json_schema",
                "name": name,
                "strict": True,
                "schema": schema,
            }
        },
    }
    if reasoning_effort and str(reasoning_effort).lower() not in {"none", "off", "false", "0"}:
        payload["reasoning"] = {"effort": str(reasoning_effort)}
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "authorization": f"Bearer {OPENAI_API_KEY}",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8")
        try:
            data = json.loads(body)
            message = data.get("error", {}).get("message", body)
        except json.JSONDecodeError:
            message = body
        raise RuntimeError(message) from error
    text = output_text(data)
    if not text:
        raise RuntimeError("OpenAI response had no output text")
    return json.loads(text)


def read_exact(sock, length):
    chunks = []
    remaining = length
    while remaining > 0:
        chunk = sock.recv(remaining)
        if not chunk:
            raise RuntimeError("websocket closed while reading frame")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def websocket_connect(path=None, timeout=30):
    if not ZOO_API_TOKEN:
        raise RuntimeError("ZOO_API_TOKEN is not set")
    request_path = path or ZOO_WS_PATH
    raw_sock = socket.create_connection((ZOO_WS_HOST, 443), timeout=timeout)
    sock = ssl.create_default_context().wrap_socket(raw_sock, server_hostname=ZOO_WS_HOST)
    sock.settimeout(timeout)
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    headers = [
        f"GET {request_path} HTTP/1.1",
        f"Host: {ZOO_WS_HOST}",
        "Upgrade: websocket",
        "Connection: Upgrade",
        f"Sec-WebSocket-Key: {key}",
        "Sec-WebSocket-Version: 13",
        f"Authorization: Bearer {ZOO_API_TOKEN}",
        "User-Agent: web-view-wall-zookeeper",
        "\r\n",
    ]
    sock.sendall("\r\n".join(headers).encode("ascii"))
    response = b""
    while b"\r\n\r\n" not in response:
        response += sock.recv(4096)
        if len(response) > 65536:
            raise RuntimeError("websocket upgrade response was too large")
    header_text = response.split(b"\r\n\r\n", 1)[0].decode("iso-8859-1", errors="replace")
    lines = header_text.split("\r\n")
    if not lines or " 101 " not in lines[0]:
        raise RuntimeError(f"websocket upgrade failed: {lines[0] if lines else header_text}")
    expected_accept = base64.b64encode(
        hashlib.sha1(f"{key}{WEBSOCKET_GUID}".encode("ascii")).digest()
    ).decode("ascii")
    accept_header = ""
    for line in lines[1:]:
        name, _, value = line.partition(":")
        if name.lower() == "sec-websocket-accept":
            accept_header = value.strip()
            break
    if accept_header != expected_accept:
        raise RuntimeError("websocket upgrade failed: invalid Sec-WebSocket-Accept")
    return sock


def websocket_send_frame(sock, opcode, payload=b""):
    length = len(payload)
    header = bytearray([0x80 | opcode])
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", length))
    mask = os.urandom(4)
    header.extend(mask)
    masked_payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    sock.sendall(bytes(header) + masked_payload)


def websocket_send_json(sock, value):
    websocket_send_frame(sock, 0x1, json.dumps(value).encode("utf-8"))


def websocket_recv_frame(sock):
    first, second = read_exact(sock, 2)
    fin = bool(first & 0x80)
    opcode = first & 0x0F
    masked = bool(second & 0x80)
    length = second & 0x7F
    if length == 126:
        length = struct.unpack("!H", read_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", read_exact(sock, 8))[0]
    mask = read_exact(sock, 4) if masked else b""
    payload = read_exact(sock, length) if length else b""
    if masked:
        payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    return fin, opcode, payload


def websocket_recv_text(sock):
    fragments = []
    text_started = False
    while True:
        fin, opcode, payload = websocket_recv_frame(sock)
        if opcode == 0x8:
            raise RuntimeError("websocket closed by server")
        if opcode == 0x9:
            websocket_send_frame(sock, 0xA, payload)
            continue
        if opcode == 0xA:
            continue
        if opcode == 0x1:
            text_started = True
            fragments.append(payload)
        elif opcode == 0x0 and text_started:
            fragments.append(payload)
        else:
            continue
        if fin:
            return b"".join(fragments).decode("utf-8", errors="replace")


def websocket_close(sock):
    try:
        websocket_send_frame(sock, 0x8, b"")
    except Exception:
        pass
    try:
        sock.close()
    except Exception:
        pass


def iter_json_values(value):
    yield value
    if isinstance(value, dict):
        for item in value.values():
            yield from iter_json_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from iter_json_values(item)


def extract_kcl_output(frame):
    for value in iter_json_values(frame):
        if not isinstance(value, dict):
            continue
        outputs = value.get("outputs")
        if not isinstance(outputs, dict):
            continue
        for preferred_name in ("main.kcl", "./main.kcl"):
            if isinstance(outputs.get(preferred_name), str) and outputs[preferred_name].strip():
                return outputs[preferred_name]
        for path, contents in outputs.items():
            if str(path).endswith(".kcl") and isinstance(contents, str) and contents.strip():
                return contents
    return None


def extract_dialog_line(frame):
    if not isinstance(frame, dict):
        return None
    frame_marker = json.dumps(frame)[:200].lower()
    frame_type = str(frame.get("type") or frame.get("message_type") or "").lower()
    if "error" in frame_type and isinstance(frame.get("detail"), str):
        return f"error: {frame['detail']}"
    if isinstance(frame.get("whole_response"), str):
        return frame["whole_response"]
    if isinstance(frame.get("delta"), str):
        return frame["delta"]
    for value in iter_json_values(frame):
        if isinstance(value, dict):
            if isinstance(value.get("detail"), str) and "error" in json.dumps(frame)[:100].lower():
                return f"error: {value['detail']}"
            if isinstance(value.get("whole_response"), str):
                return value["whole_response"]
            if isinstance(value.get("delta"), str):
                return value["delta"]
            if isinstance(value.get("content"), str) and ("reason" in frame_marker or "markdown" in str(value.get("type", "")).lower()):
                return value["content"]
            if isinstance(value.get("msg"), str):
                return value["msg"]
            if isinstance(value.get("message"), str):
                return value["message"]
    return None


def is_dialog_delta_frame(frame):
    if not isinstance(frame, dict):
        return False
    if isinstance(frame.get("whole_response"), str):
        return False
    if isinstance(frame.get("delta"), str):
        return True
    for value in iter_json_values(frame):
        if isinstance(value, dict):
            if isinstance(value.get("whole_response"), str):
                return False
            if isinstance(value.get("delta"), str):
                return True
    return False


class DialogDeltaBuffer:
    def __init__(self, max_chars=4000, min_sentence_chars=56):
        self.pending = ""
        self.max_chars = max_chars
        self.min_sentence_chars = min_sentence_chars
        self.suppress_structured_payload = False

    def is_structured_payload(self):
        return bool(re.match(r'^\s*\{\s*"(?:assembly_title|summary)"\s*:', self.pending))

    def append(self, value):
        self.pending += str(value or "")
        if not self.suppress_structured_payload and self.is_structured_payload():
            self.suppress_structured_payload = True
            self.pending = ""
            return ["Structured plan payload received; validating hierarchy and BOM."]
        if self.suppress_structured_payload:
            self.pending = ""
            return []
        return self.flush_ready()

    def flush_ready(self):
        lines = []
        while "\n" in self.pending:
            before, after = self.pending.split("\n", 1)
            self.pending = after
            if before.strip():
                lines.append(before)

        if not self.pending.strip():
            self.pending = ""
            return lines

        stripped = self.pending.strip()
        if len(stripped) >= self.min_sentence_chars and re.search(r'[.!?]["\')\]]?\s*$', stripped):
            lines.append(self.pending)
            self.pending = ""
            return lines

        if len(stripped) >= self.max_chars:
            split_at = max(
                self.pending.rfind(". "),
                self.pending.rfind("! "),
                self.pending.rfind("? "),
                self.pending.rfind("; "),
                self.pending.rfind(", "),
            )
            if split_at < self.max_chars // 2:
                split_at = self.pending.rfind(" ", 0, self.max_chars)
            if split_at < self.max_chars // 2:
                split_at = self.max_chars
            lines.append(self.pending[:split_at + 1])
            self.pending = self.pending[split_at + 1:]
        return lines

    def flush(self):
        if self.suppress_structured_payload:
            self.pending = ""
            return []
        if not self.pending.strip():
            self.pending = ""
            return []
        line = self.pending
        self.pending = ""
        return [line]


def is_end_of_stream(frame):
    if not isinstance(frame, dict):
        return False
    if any(str(key).lower() in {"end_of_stream", "endofstream"} for key in frame):
        return True
    frame_type = str(frame.get("type") or frame.get("message_type") or "").lower()
    return "endofstream" in frame_type.replace("_", "") or "end_of_stream" in frame_type


def is_error_frame(frame):
    if not isinstance(frame, dict):
        return False
    if any(str(key).lower() == "error" for key in frame):
        return True
    frame_type = str(frame.get("type") or frame.get("message_type") or "").lower()
    return "error" in frame_type


def zookeeper_turn(
    user_message,
    current_files,
    project_name,
    timeout=300,
    stop_on_kcl=False,
    stop_when=None,
    on_kcl=None,
    on_dialog=None,
):
    sock = websocket_connect(timeout=30)
    started = time.monotonic()
    frames = []
    latest_kcl = None
    kcl_frames = 0
    dialog = []
    raw_dialog = []
    raw_delta_text = []
    raw_response_text = []
    dialog_buffer = DialogDeltaBuffer()
    final_text = ""

    def record_dialog_line(line):
        dialog_line = sanitize_dialog_text(line, line)
        if re.match(r'^\s*\{\s*"(?:assembly_title|summary)"\s*:', dialog_line):
            return
        raw_dialog.append(dialog_line)
        dialog.append(dialog_line)
        if on_dialog:
            on_dialog(dialog[-1])

    def flush_dialog_buffer():
        for buffered_line in dialog_buffer.flush():
            record_dialog_line(buffered_line)

    try:
        sock.settimeout(10)
        initial_deadline = time.monotonic() + 20
        while time.monotonic() < initial_deadline:
            try:
                raw = websocket_recv_text(sock)
            except socket.timeout:
                break
            try:
                frame = json.loads(raw)
            except json.JSONDecodeError:
                continue
            frames.append(frame)
            if isinstance(frame, dict) and "conversation_id" in frame:
                break
        websocket_send_json(sock, {
            "type": "user",
            "content": user_message,
            "mode": "auto",
            "current_files": current_files,
            "project_name": project_name,
        })
        sock.settimeout(45)
        while time.monotonic() - started < timeout:
            try:
                raw = websocket_recv_text(sock)
            except socket.timeout:
                continue
            try:
                frame = json.loads(raw)
            except json.JSONDecodeError:
                continue
            frames.append(frame)
            line = extract_dialog_line(frame)
            if line:
                raw_response_text.append(line)
                if is_dialog_delta_frame(frame):
                    raw_delta_text.append(line)
                    for buffered_line in dialog_buffer.append(line):
                        record_dialog_line(buffered_line)
                else:
                    flush_dialog_buffer()
                    record_dialog_line(line)
                if isinstance(frame, dict) and isinstance(frame.get("whole_response"), str):
                    final_text = frame["whole_response"]
                if stop_when:
                    response_text = final_text or "".join(raw_delta_text) or "\n".join(raw_response_text)
                    if response_text and stop_when(response_text):
                        flush_dialog_buffer()
                        break
            kcl = extract_kcl_output(frame)
            if kcl:
                flush_dialog_buffer()
                latest_kcl = kcl
                kcl_frames += 1
                if on_kcl:
                    on_kcl(kcl, kcl_frames)
                if stop_on_kcl:
                    break
            if is_error_frame(frame):
                flush_dialog_buffer()
                raise RuntimeError(extract_dialog_line(frame) or "Zookeeper websocket returned an error")
            if is_end_of_stream(frame):
                flush_dialog_buffer()
                break
        else:
            flush_dialog_buffer()
            raise RuntimeError("Zookeeper websocket turn timed out")
    finally:
        websocket_close(sock)
    flush_dialog_buffer()
    return {
        "kcl": latest_kcl,
        "summary": sanitize_text(final_text or (dialog[-1] if dialog else ""), "Zookeeper auto completed."),
        "rawText": final_text or "".join(raw_delta_text) or "\n".join(raw_response_text) or "\n".join(raw_dialog[-24:]),
        "dialog": dialog[-12:],
        "frames": len(frames),
        "kclFrames": kcl_frames,
    }


def build_zookeeper_agent_prompt(body, agent, current_kcl, imports, render_error, attempt):
    role = sanitize_text(agent.get("role"), "part")
    instruction = sanitize_text(agent.get("instruction"), f"Work on {role}.")
    kind = sanitize_text(agent.get("kind"), "worker")
    scope = sanitize_scope(agent.get("scope"), kind)
    name = sanitize_text(agent.get("name"), "Zookeeper Agent")
    root_instruction = sanitize_text(body.get("rootInstruction"), "Coordinate the assembly.")
    assembly_prompt = sanitize_text(body.get("prompt"), "assembly")
    interface_context = format_interface_context(body.get("interfaces"))
    agents_instruction = wall_agents_instruction()
    repair_text = (
        f"\nRenderer error from the wall viewer that must be repaired:\n{render_error}\n"
        if render_error else ""
    )
    review_text = (
        f"\nParent orchestrator visual review requested this rework:\n{sanitize_text(body.get('reviewInstruction'), '')}\n"
        if body.get("reviewInstruction") else ""
    )
    if kind == "orchestrator":
        return "\n".join([
            f"You are {name}, running as a hosted Zoo Zookeeper in auto mode.",
            agents_instruction,
            "You are an assembly orchestrator. Your job is placement only.",
            f"Assembly prompt: {assembly_prompt}",
            f"Parent/root instruction: {root_instruction}",
            f"Agent scope: {scope}",
            f"Assigned role: {role}",
            f"Assigned instruction: {instruction}",
            "Edit the provided project file named main.kcl.",
            "You may import child components with aliases, clone imported components, hide raw imports, and use translate(), rotate(), scale(), and appearance() to place components.",
            "This is an incremental assembly update. Place every currently available imported child now; do not wait for pending children and do not invent stand-ins for them.",
            "You own symmetry and repeated placement. Use clone() plus explicit translate/rotate/scale transforms to create bilateral mirrored placements, radial patterns, linear arrays, and repeated hardware from one canonical imported part.",
            "Do not ask workers to generate a bolt set, left/right set, rib array, fin pair, washer pack, or other repeated placement. Workers provide one canonical part unless the geometry is truly handed; this orchestrator clones and places the instances.",
            "For mirrored placements, document the mirror plane or symmetry axis and use explicit transforms that a reviewer can audit from the KCL. For radial/linear patterns, document count, spacing/angle, source alias, and target mate points.",
            "Do not create part geometry. Do not use startSketchOn, startProfile, line, circle, close, extrude, revolve, subtract, boolean tools, or new primitive solids.",
            "Place only direct child/sub-assembly imports and explicit shared reusable imports that already appear in main.kcl import lines. Other project files are read-only context and evidence.",
            "Do not add imports for grandchildren, concrete descendant workers, or sibling sub-assembly internals to work around a broken child aggregate.",
            "If an imported child/sub-assembly alias evaluates to no return value or none, keep the parent placement partial, record the missing child in placement_warnings, and let review target that child orchestrator for repair.",
            "Keep each direct child/sub-assembly as a separate imported component and arrange those components into the assembly.",
            "Return one renderable assembly aggregate as the final expression in main.kcl. The last non-comment statement must be the aggregate/component that the parent can import and place.",
            "When an imported alias is a shared reusable component such as a bolt, screw, washer, pin, bearing, or spacer, clone that one canonical component into each required placement. The count and placement of repeated hardware belongs in this orchestrator file, not in the shared part file.",
            "For every shared reusable component import you place, include a concise comment near the placement in the form // BOM: <quantity>x <alias> (<role>) so the wall graph can display the bill of materials.",
            "Read the child KCL files and interface manifests before selecting transforms. Place by aligning named mate points, local axes, bounding boxes, and dimensions; do not guess directions or distances from the render alone.",
            "Maintain a // ZOOKEEPER_INTERFACE block for this assembled file with units, local_origin, local_axes, bbox_mm, mate_points, child_placements, reused_components, and placement_warnings.",
            "The wall server preserves import lines from the current file, so write the placement body that references those aliases.",
            f"Placement/review attempt: {attempt}",
            repair_text,
            review_text,
            "Existing import lines and aliases available to place:",
            imports or "(none)",
            "Current interface manifests from child/sub-assembly files:",
            interface_context or "(none yet; inspect child KCL files directly and write placement_warnings for missing manifests)",
            "Current placement body:",
            strip_import_lines(current_kcl)[:6000] or "(empty)",
        ])
    return "\n".join([
        f"You are {name}, running as a hosted Zoo Zookeeper in auto mode.",
        agents_instruction,
        f"Assembly prompt: {assembly_prompt}",
        f"Parent/root instruction: {root_instruction}",
            f"Agent kind: {kind}",
            f"Agent scope: {scope}",
            f"Assigned role: {role}",
            f"Assigned instruction: {instruction}",
            "Edit the provided project file named main.kcl.",
            "This wall server maps your main.kcl output back into the agent's assigned file path.",
            "Import lines are managed by the wall server; keep your output self-contained and do not rely on editing sibling files.",
            "Use Zoo's CAD/KCL tools to write, inspect, execute, and repair the KCL instead of guessing.",
            "Return a complete renderable KCL model for this one part or sub-assembly.",
            "If Agent scope is shared_part, model exactly one canonical reusable component, not a set or pattern of many repeated copies. For example, a bolt worker returns one bolt, not a bolt circle or bolt set. Expose mate points, axis, head diameter, shank diameter, length, and reuse guidance in the interface block so orchestrators can clone and place it repeatedly.",
            "If Agent scope is part, model one physical part, not a mirrored pair, left/right set, rib array, bolt circle, washer pack, or repeated placement pattern. Leave clone, mirror, array, radial pattern, and hardware-placement work to orchestrators.",
            "If a part is intended to be reused in mirrored or patterned placements, expose mate points, local axes, symmetry plane/axis, and any handedness/chirality note in the interface block.",
            "Do not absorb reusable hardware into this file when the imports include shared hardware aliases; reference the interface expectations and leave repeated placement to orchestrators.",
            "Include a // ZOOKEEPER_INTERFACE block near the top of the KCL body. It must state units, local_origin, local_axes, bbox_mm, mate_points, exported_aggregate, key_dimensions, and parent_interface.",
            "Use concrete dimensions and named mate points/axes that an orchestrator can align later. Do not use vague placeholders such as TBD, approximate, or visually align.",
        f"Repair attempt: {attempt}",
        repair_text,
        review_text,
        "Known sibling/parent interface manifests that may constrain this repair:",
        interface_context or "(none yet)",
        "Existing import lines that the wall server will preserve outside your editable body:",
        imports or "(none)",
        "Current KCL body:",
        strip_import_lines(current_kcl)[:6000] or "(empty)",
    ])


def zookeeper_agent_work(body, agent, imports, current_kcl, render_error, attempt, emit=None):
    project_name = slug(agent.get("name") or agent.get("role") or "zookeeper-agent")
    prompt = build_zookeeper_agent_prompt(body, agent, current_kcl, imports, render_error, attempt)
    import_context_paths = (body.get("files") or {}).keys()
    rewritten_imports = rewrite_import_paths_for_render(imports, import_context_paths)

    def emit_dialog(line):
        if not emit:
            return
        emit({"type": "dialog", "line": line})

    def emit_draft(kcl, draft_index):
        if not emit:
            return
        body_kcl = clean_model_kcl(kcl)
        emit({
            "type": "draft",
            "draftIndex": draft_index,
            "kcl": attach_imports(rewritten_imports, body_kcl),
            "summary": f"Zookeeper draft KCL {draft_index}",
        })

    if sanitize_text(agent.get("kind"), "worker") == "orchestrator":
        files = body.get("files") or {}
        current_files = render_files_for_zookeeper(files)
        current_files["main.kcl"] = rewrite_import_paths_for_render(current_kcl, list(files.keys()))
    else:
        current_files = {"main.kcl": strip_import_lines(current_kcl)}
    result = zookeeper_turn(
        prompt,
        current_files,
        project_name,
        stop_on_kcl=False,
        on_kcl=emit_draft if emit else None,
        on_dialog=emit_dialog if emit else None,
    )
    if not result.get("kcl"):
        raise RuntimeError("Zookeeper completed without an EditKclCode output")
    body_kcl = clean_model_kcl(result["kcl"])
    return {
        "source": "zookeeper",
        "summary": result["summary"],
        "kcl": attach_imports(rewritten_imports, body_kcl),
        "dialog": result["dialog"],
        "frames": result["frames"],
        "drafts": result["kclFrames"],
        "mode": "auto",
    }


def parse_review_payload(text):
    clean = strip_markdown_fences(text)
    decoder = json.JSONDecoder()
    payloads = []
    for index, char in enumerate(clean):
        if char != "{":
            continue
        try:
            payload, _ = decoder.raw_decode(clean[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            payloads.append(payload)
    return next(
        (
            payload for payload in reversed(payloads)
            if isinstance(payload.get("rework") or payload.get("changes"), list) or isinstance(payload.get("bom"), dict)
        ),
        payloads[-1] if payloads else {},
    )


def parse_plan_payload(text):
    clean = strip_markdown_fences(text)
    decoder = json.JSONDecoder()
    payloads = []
    for index, char in enumerate(clean):
        if char != "{":
            continue
        try:
            payload, _ = decoder.raw_decode(clean[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and isinstance(payload.get("agents"), list):
            payloads.append(payload)
    return payloads[-1] if payloads else {}


def parse_sub_bom_payload(text):
    clean = strip_markdown_fences(text)
    decoder = json.JSONDecoder()
    payloads = []
    for index, char in enumerate(clean):
        if char != "{":
            continue
        try:
            payload, _ = decoder.raw_decode(clean[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and isinstance(payload.get("children"), list):
            payloads.append(payload)
    return payloads[-1] if payloads else {}


def parse_rework_items(payload):
    if not isinstance(payload, dict):
        return []
    items = payload.get("rework") or payload.get("changes") or []
    if not isinstance(items, list):
        return []
    parsed = []
    for item in items[:4]:
        if not isinstance(item, dict):
            continue
        target = sanitize_text(item.get("target") or item.get("agent") or item.get("file") or "", "")
        instruction = sanitize_text(item.get("instruction") or item.get("change") or item.get("request") or "", "")
        reason = sanitize_text(item.get("reason") or item.get("why") or "", "")
        if not instruction:
            continue
        parsed.append({
            "target": target,
            "instruction": instruction,
            "reason": reason,
        })
    return parsed


def list_from_value(value, limit=8):
    if isinstance(value, list):
        return [sanitize_text(item, "") for item in value[:limit] if sanitize_text(item, "")]
    if isinstance(value, str):
        return [sanitize_text(item, "") for item in re.split(r"[,;\n]+", value)[:limit] if sanitize_text(item, "")]
    return []


def parse_bom_review(payload):
    if not isinstance(payload, dict):
        return {"sharedComponents": [], "importUpdates": []}
    bom = payload.get("bom") if isinstance(payload.get("bom"), dict) else payload
    shared_items = (
        bom.get("sharedComponents")
        or bom.get("shared_components")
        or bom.get("newSharedComponents")
        or []
    )
    import_items = (
        bom.get("importUpdates")
        or bom.get("import_updates")
        or bom.get("imports")
        or []
    )
    shared = []
    if isinstance(shared_items, list):
        for item in shared_items[:6]:
            if not isinstance(item, dict):
                continue
            role = sanitize_text(item.get("role") or item.get("component") or item.get("name"), "")
            instruction = sanitize_text(item.get("instruction") or item.get("request") or "", "")
            reason = sanitize_text(item.get("reason") or item.get("why") or "", "")
            consumers = unique_list(list_from_value(item.get("consumers") or item.get("usedBy") or item.get("used_by"), 12))
            if not role:
                continue
            if not instruction:
                instruction = f"Generate one canonical reusable {role}. Model exactly one instance, not a set."
            shared.append({
                "role": role,
                "reason": reason,
                "instruction": instruction,
                "consumers": consumers,
            })
    imports = []
    if isinstance(import_items, list):
        for item in import_items[:16]:
            if not isinstance(item, dict):
                continue
            component = sanitize_text(item.get("component") or item.get("sharedComponent") or item.get("shared_component") or item.get("role"), "")
            consumer = sanitize_text(item.get("consumer") or item.get("orchestrator") or item.get("assembly") or item.get("target"), "")
            reason = sanitize_text(item.get("reason") or item.get("why") or "", "")
            if not component or not consumer:
                continue
            imports.append({
                "component": component,
                "consumer": consumer,
                "reason": reason,
            })
    return {
        "sharedComponents": shared,
        "importUpdates": imports,
    }


def is_retryable_zookeeper_connection_error(error):
    message = str(error).lower()
    return any(fragment in message for fragment in (
        "websocket closed",
        "connection reset",
        "connection aborted",
        "broken pipe",
        "timed out",
        "timeout",
        "socket",
    ))


def zookeeper_review(body):
    review_id = uuid.uuid4().hex[:12]
    started = time.monotonic()
    metrics = review_metrics(body)
    log_event("review.start", {
        "reviewId": review_id,
        **metrics,
    })
    try:
        attempts = 0
        while True:
            try:
                result = zookeeper_review_impl(body, review_id)
                break
            except Exception as error:
                attempts += 1
                if attempts >= 2 or not is_retryable_zookeeper_connection_error(error):
                    raise
                log_event("review.retry", {
                    "reviewId": review_id,
                    "attempt": attempts,
                    "error": str(error),
                    "errorType": type(error).__name__,
                    **metrics,
                })
                time.sleep(0.75)
        log_event("review.success", {
            "reviewId": review_id,
            "durationMs": int((time.monotonic() - started) * 1000),
            "attempts": attempts + 1,
            "frames": result.get("frames"),
            "summary": sanitize_text(result.get("summary"), ""),
            "reworkCount": len(result.get("rework") or []),
            "sharedComponentCount": len(((result.get("bom") or {}).get("sharedComponents") or [])),
            "importUpdateCount": len(((result.get("bom") or {}).get("importUpdates") or [])),
            **metrics,
        })
        return result
    except Exception as error:
        trace_payload = {
            "reviewId": review_id,
            "ts": utc_timestamp(),
            "durationMs": int((time.monotonic() - started) * 1000),
            "metrics": metrics,
            "error": str(error),
            "errorType": type(error).__name__,
            "traceback": traceback.format_exc(),
            "request": body,
        }
        try:
            trace_path = write_trace_file("review-error", trace_payload)
        except OSError as trace_error:
            trace_path = f"<trace write failed: {trace_error}>"
        log_event("review.error", {
            "reviewId": review_id,
            "durationMs": int((time.monotonic() - started) * 1000),
            "error": str(error),
            "errorType": type(error).__name__,
            "tracePath": trace_path,
            **metrics,
        })
        raise RuntimeError(f"review {review_id} failed: {error}; trace={trace_path}") from error


def zookeeper_review_impl(body, review_id):
    agent = body.get("agent") or {}
    child = body.get("child") or {}
    files = body.get("files") or {}
    if not isinstance(files, dict) or not files:
        raise RuntimeError("review requires project files")
    current_files = render_files_for_zookeeper(files)
    name = sanitize_text(agent.get("name"), "Zookeeper Orchestrator")
    role = sanitize_text(agent.get("role"), "assembly")
    child_name = sanitize_text(child.get("name"), "child agent")
    child_role = sanitize_text(child.get("role"), "child update")
    child_file = sanitize_text(child.get("filePath"), "")
    agent_file = sanitize_text(agent.get("filePath"), ROOT_FILE_PATH)
    interface_context = format_interface_context(body.get("interfaces"))
    agents_instruction = wall_agents_instruction()
    child_list = body.get("children") or []
    child_lines = []
    if isinstance(child_list, list):
        for item in child_list[:24]:
            if not isinstance(item, dict):
                continue
            child_lines.append(
                f"- {sanitize_text(item.get('name'), 'child')} | role={sanitize_text(item.get('role'), '')} | scope={sanitize_text(item.get('scope'), '')} | file={sanitize_text(item.get('filePath'), '')} | imports={', '.join(list_from_value(item.get('imports'), 8)) or 'none'}"
            )
    all_agents = body.get("allAgents") or []
    all_agent_lines = []
    if isinstance(all_agents, list):
        for item in all_agents[:80]:
            if not isinstance(item, dict):
                continue
            all_agent_lines.append(
                f"- {sanitize_text(item.get('name'), 'agent')} | kind={sanitize_text(item.get('kind'), '')} | scope={sanitize_text(item.get('scope'), '')} | role={sanitize_text(item.get('role'), '')} | parent={sanitize_text(item.get('parentId'), '')} | file={sanitize_text(item.get('filePath'), '')} | imports={', '.join(list_from_value(item.get('imports'), 8)) or 'none'}"
            )
    prompt = "\n".join([
        f"You are {name}, running as a hosted Zoo Zookeeper in auto mode.",
        agents_instruction,
        "You are reviewing a CAD assembly after a child agent returned KCL.",
        "This may be a partial assembly. Assess and request placement rework for the currently available direct children now; do not defer feedback merely because other children are still pending.",
        "Use Zoo's CAD/KCL tools to inspect or execute the provided project visually.",
        "Also inspect the underlying KCL files and the interface manifests; do not rely on the render alone for axis direction, distance, or ownership.",
        "Do not edit files in this review turn.",
        f"Assembly prompt: {sanitize_text(body.get('prompt'), 'assembly')}",
        f"Orchestrator role: {role}",
        f"Orchestrator entry file: {agent_file}",
        f"Recent child update: {child_name} / {child_role} / {child_file}",
        "Available child agents that can receive rework:",
        "\n".join(child_lines) or "(none)",
        "All current graph agents and BOM/import context:",
        "\n".join(all_agent_lines) or "(none)",
        "Available interface manifests:",
        interface_context or "(none)",
        "Decide whether any child or orchestrator needs rework based on visual/model result, KCL evidence, and interface fit.",
        "Target an orchestrator when the problem is placement, transform, imports, mate alignment, axis convention, or assembly integration. Target a worker only when that worker's own part geometry is wrong.",
        "If a parent assembly is reaching through to import/place grandchildren because a child sub-assembly returns no usable aggregate, target the child sub-orchestrator for repair. Do not recommend adding grandchild imports to the parent.",
        "Every orchestrator/sub-assembly file must return a renderable aggregate as its final expression so its parent can place the sub-assembly as one component.",
        "Also review the bill of materials across the whole assembly.",
        "If repeated hardware or reusable components are blended into local worker files, propose a canonical shared component and import updates for the consuming orchestrators.",
        "Shared components must be singular files, for example one bolt, one bearing, one bushing, one washer, one pin, one nut. Do not propose a bolt set or hardware pack.",
        "Use importUpdates when an existing shared component should be imported by another sub-assembly. Use sharedComponents when a new canonical reusable worker should be created.",
        "Return JSON only with this exact shape:",
        '{"summary":"one sentence visual review","rework":[{"target":"exact orchestrator or worker role/name/file when possible","reason":"why, including KCL/interface evidence","instruction":"specific rework request"}],"bom":{"sharedComponents":[{"role":"singular reusable component name","reason":"why this should be shared","instruction":"worker instruction for one canonical reusable part","consumers":["orchestrator role/name that should import it"]}],"importUpdates":[{"component":"existing shared component role/name","consumer":"orchestrator role/name that should import it","reason":"why the import is needed"}]}}',
        "If no rework is needed, return an empty rework array.",
        "If no BOM changes are needed, return empty sharedComponents and importUpdates arrays.",
    ])
    result = zookeeper_turn(
        prompt,
        current_files,
        slug(f"{name or role or 'zookeeper-review'}-{review_id}"),
        timeout=240,
        stop_on_kcl=False,
        stop_when=lambda text: bool(parse_review_payload(text)),
    )
    text = result.get("rawText") or result["summary"] or "\n".join(result["dialog"])
    payload = parse_review_payload(text)
    return {
        "source": "zookeeper",
        "summary": sanitize_text(payload.get("summary") if isinstance(payload, dict) else text, "Visual review completed."),
        "rework": parse_rework_items(payload),
        "bom": parse_bom_review(payload),
        "dialog": result["dialog"],
        "frames": result["frames"],
        "mode": "auto",
    }


def normalize_plan(raw_plan, prompt, max_agents):
    source_agents = [
        raw_agent for raw_agent in list(raw_plan.get("agents") or [])
        if isinstance(raw_agent, dict)
    ]
    has_shared_parts = any(
        str(raw_agent.get("kind")) == "worker" and sanitize_scope(raw_agent.get("scope"), "worker") == "shared_part"
        for raw_agent in source_agents
    )
    has_library = any(
        str(raw_agent.get("kind")) == "orchestrator" and re.search(
            r"\b(shared|reusable|library|catalog|standard)\b",
            f"{raw_agent.get('key', '')} {raw_agent.get('role', '')}",
            re.I,
        )
        for raw_agent in source_agents
    )
    raw_agents = list(source_agents)
    if has_shared_parts and not has_library:
        raw_agents.insert(0, {
            "key": "shared_library",
            "parent_key": "root",
            "kind": "orchestrator",
            "scope": "assembly",
            "role": "reusable component library",
            "instruction": "Own the canonical reusable component files such as bolts, screws, washers, pins, bearings, bushings, and other repeated hardware as BOM metadata only. Do not place them into an assembly; make them available for other orchestrators to import and clone.",
            "imports": [],
        })
    if max_agents is not None:
        raw_agents = raw_agents[:max_agents]
    if not raw_agents:
        raise RuntimeError("OpenAI plan did not include agents")

    key_to_id = {}
    key_to_raw = {}
    orchestrator_count = 0
    worker_count = 0
    for index, raw_agent in enumerate(raw_agents):
        raw_key = str(raw_agent.get("key") or f"agent-{index + 1}")
        key = raw_key
        suffix = 2
        while key in key_to_raw:
            key = f"{raw_key}-{suffix}"
            suffix += 1
        raw_agent["key"] = key
        key_to_raw[key] = raw_agent
        kind = "orchestrator" if raw_agent.get("kind") == "orchestrator" else "worker"
        if kind == "orchestrator":
            orchestrator_count += 1
            key_to_id[key] = f"sub-orchestrator-{orchestrator_count:04d}"
        else:
            worker_count += 1
            key_to_id[key] = f"worker-{worker_count:04d}"

    orchestrator_keys = [
        key for key, raw_agent in key_to_raw.items()
        if raw_agent.get("kind") == "orchestrator"
    ]
    library_key = next((
        key for key in orchestrator_keys
        if re.search(r"\b(shared|reusable|library|catalog|standard)\b", f"{key} {key_to_raw[key].get('role', '')}", re.I)
    ), None)
    assembly_orchestrator_keys = [
        key for key in orchestrator_keys
        if key != library_key
    ] or orchestrator_keys

    def text_tokens(value):
        return set(
            token for token in re.split(r"[^a-z0-9]+", str(value).lower())
            if len(token) > 3
        )

    def best_orchestrator_key(raw_agent):
        if not assembly_orchestrator_keys:
            return None
        agent_tokens = text_tokens(f"{raw_agent.get('role', '')} {raw_agent.get('instruction', '')}")
        ranked = []
        for key in assembly_orchestrator_keys:
            orchestrator = key_to_raw[key]
            orchestrator_tokens = text_tokens(f"{orchestrator.get('role', '')} {orchestrator.get('instruction', '')}")
            score = len(agent_tokens & orchestrator_tokens)
            ranked.append((score, key))
        ranked.sort(key=lambda item: (-item[0], item[1]))
        return ranked[0][1]

    repaired_parent_count = 0
    hierarchy_repair_count = 0

    agents = []
    for raw_agent in raw_agents:
        kind = "orchestrator" if raw_agent.get("kind") == "orchestrator" else "worker"
        scope = sanitize_scope(raw_agent.get("scope"), kind)
        key = str(raw_agent.get("key"))
        agent_id = key_to_id[key]
        raw_parent_key = str(raw_agent.get("parent_key") or "root")
        parent_key = raw_parent_key
        if kind == "worker" and scope == "shared_part":
            parent_key = library_key or (raw_parent_key if raw_parent_key in orchestrator_keys else "root")
        elif kind == "worker":
            if raw_parent_key == "root" or raw_parent_key not in orchestrator_keys:
                parent_key = best_orchestrator_key(raw_agent) or "root"
                if parent_key != raw_parent_key:
                    repaired_parent_count += 1
        elif raw_parent_key != "root" and raw_parent_key not in orchestrator_keys:
            parent_key = "root"
            repaired_parent_count += 1
        if parent_key == key:
            parent_key = "root"
            repaired_parent_count += 1
        parent_id = ROOT_AGENT_ID if parent_key == "root" else key_to_id.get(parent_key, ROOT_AGENT_ID)
        sequence = re.search(r"(\d{4})$", agent_id).group(1)
        label = "Sub-Orchestrator" if kind == "orchestrator" else "Worker"
        role = sanitize_text(raw_agent.get("role"), "sub-assembly" if kind == "orchestrator" else "part")
        folder = "generated/library" if scope == "shared_part" else "generated"
        agents.append({
            "id": agent_id,
            "parentId": parent_id,
            "kind": kind,
            "name": f"Zookeeper {label} {sequence}",
            "role": role,
            "instruction": sanitize_text(raw_agent.get("instruction"), f"Work on {role}."),
            "filePath": f"{folder}/{slug(role)}-{sequence}.kcl",
            "scope": scope,
            "imports": [],
            "source": "openai",
        })

    file_by_key = {
        str(raw_agent.get("key")): agent["filePath"]
        for raw_agent, agent in zip(raw_agents, agents)
    }
    shared_files_by_key = {
        str(raw_agent.get("key")): agent["filePath"]
        for raw_agent, agent in zip(raw_agents, agents)
        if agent.get("scope") == "shared_part"
    }

    def import_paths_for(raw_agent, agent):
        raw_imports = raw_agent.get("imports") or []
        paths = []
        if isinstance(raw_imports, list):
            for import_key in raw_imports[:16]:
                key = str(import_key or "").strip()
                if key in file_by_key and file_by_key[key] != agent["filePath"]:
                    paths.append(file_by_key[key])
                elif key.endswith(".kcl") and key != agent["filePath"]:
                    paths.append(key)
        if agent["kind"] == "orchestrator" and agent.get("scope") != "shared_part":
            text = f"{agent.get('role', '')} {agent.get('instruction', '')}".lower()
            for key, file_path in shared_files_by_key.items():
                shared_text = f"{key} {key_to_raw.get(key, {}).get('role', '')}".lower()
                shared_tokens = text_tokens(shared_text)
                if text_tokens(text) & shared_tokens:
                    paths.append(file_path)
                elif re.search(r"\b(fasten|bolt|screw|washer|pin|mount|attach|joint|housing|cover|bracket|bearing)\b", text) and re.search(r"\b(bolt|screw|washer|pin|fastener|bearing|bushing)\b", shared_text):
                    paths.append(file_path)
        return unique_list(paths)

    for raw_agent, agent in zip(raw_agents, agents):
        agent["imports"] = import_paths_for(raw_agent, agent)

    def child_orchestrators(parent_id):
        return [
            child for child in agents
            if (
                child["kind"] == "orchestrator"
                and child["parentId"] == parent_id
                and not is_reusable_library_agent(child)
            )
        ]

    def descendant_leaf_orchestrators(parent_id):
        leaves = []
        stack = child_orchestrators(parent_id)
        while stack:
            current = stack.pop(0)
            nested = child_orchestrators(current["id"])
            if nested:
                stack.extend(nested)
            else:
                leaves.append(current)
        return leaves

    def agent_match_score(agent, orchestrator):
        agent_tokens = text_tokens(f"{agent.get('role', '')} {agent.get('instruction', '')}")
        orchestrator_tokens = text_tokens(f"{orchestrator.get('role', '')} {orchestrator.get('instruction', '')}")
        return len(agent_tokens & orchestrator_tokens)

    def choose_leaf_orchestrator(worker, leaves, bucket_key, round_robin_state):
        if not leaves:
            return None
        ranked = sorted(
            ((agent_match_score(worker, leaf), index, leaf) for index, leaf in enumerate(leaves)),
            key=lambda item: (-item[0], item[1]),
        )
        if ranked[0][0] > 0:
            return ranked[0][2]
        offset = round_robin_state.get(bucket_key, 0)
        round_robin_state[bucket_key] = offset + 1
        return leaves[offset % len(leaves)]

    agents_by_id = {agent["id"]: agent for agent in agents}
    leaf_bucket_offsets = {}
    for agent in agents:
        if agent["kind"] != "worker" or agent.get("scope") == "shared_part":
            continue
        parent = agents_by_id.get(agent["parentId"])
        candidate_leaves = []
        bucket_key = "root"
        if parent and parent.get("kind") == "orchestrator" and not is_reusable_library_agent(parent):
            candidate_leaves = descendant_leaf_orchestrators(parent["id"])
            bucket_key = parent["id"]
        elif parent is None or agent["parentId"] == ROOT_AGENT_ID:
            candidate_leaves = [
                orchestrator for orchestrator in agents
                if (
                    orchestrator["kind"] == "orchestrator"
                    and not is_reusable_library_agent(orchestrator)
                    and not child_orchestrators(orchestrator["id"])
                )
            ]
        leaf = choose_leaf_orchestrator(agent, candidate_leaves, bucket_key, leaf_bucket_offsets)
        if leaf and leaf["id"] != agent["parentId"]:
            agent["parentId"] = leaf["id"]
            hierarchy_repair_count += 1

    child_counts = {
        agent["id"]: sum(1 for child in agents if child["parentId"] == agent["id"])
        for agent in agents
        if agent["kind"] == "orchestrator"
    }
    empty_orchestrators = [
        agent["role"] for agent in agents
        if (
            agent["kind"] == "orchestrator"
            and agent.get("scope") != "shared_part"
            and not is_reusable_library_agent(agent)
            and child_counts.get(agent["id"], 0) == 0
        )
    ]
    planner_source = sanitize_text(raw_plan.get("_planner_source"), "openai")
    if planner_source == "zookeeper":
        notes = [
            f"Zookeeper architect planner via Zoo websocket; frames: {int(raw_plan.get('_planner_frames') or 0)}"
        ]
    elif planner_source == "openai_fallback":
        notes = [
            f"OpenAI fallback planner model: {OPENAI_PLANNER_MODEL}; reasoning effort: {OPENAI_ARCHITECT_REASONING_EFFORT}"
        ]
        fallback_reason = sanitize_text(raw_plan.get("_zookeeper_error"), "")
        if fallback_reason:
            notes.append(f"Zookeeper architect planner failed; used OpenAI fallback: {fallback_reason}")
    else:
        notes = [f"OpenAI planner model: {OPENAI_PLANNER_MODEL}; reasoning effort: {OPENAI_ARCHITECT_REASONING_EFFORT}"]
    if repaired_parent_count:
        notes.append(f"planner graph repaired: re-parented {repaired_parent_count} worker/orchestrator link(s) away from invalid or root parent keys")
    if hierarchy_repair_count:
        notes.append(f"planner hierarchy repaired: moved {hierarchy_repair_count} direct worker(s) under leaf sub-orchestrators")
    if shared_files_by_key:
        notes.append(f"reusable component files planned: {len(shared_files_by_key)}")
    if empty_orchestrators:
        notes.append(f"planner warning: childless orchestrators remain: {', '.join(empty_orchestrators[:6])}")

    return {
        "sessionId": str(uuid.uuid4()),
        "source": planner_source,
        "prompt": prompt,
        "root": {
            "instruction": sanitize_text(raw_plan.get("root_instruction"), f"Coordinate the generated assembly for: {prompt}"),
            "filePath": ROOT_FILE_PATH,
        },
        "agents": agents,
        "files": build_files(agents),
        "notes": notes,
    }


def zookeeper_orchestration_plan(prompt, max_agents, agents_instruction, on_dialog=None):
    maximum_agents = max_agents if max_agents is not None else "none; choose the required scale"
    scratchpad = "\n".join([
        "// ZOOKEEPER_ARCHITECT_SCRATCHPAD",
        "// Planning-only file for the parent Zookeeper Orchestrator.",
        "// The final answer must be JSON, not KCL.",
        f"// Prompt: {prompt}",
        f"// Maximum agents: {maximum_agents}",
        "",
    ])
    planning_prompt = "\n".join([
        "You are the top-level Zookeeper Orchestrator running in hosted Zoo auto mode.",
        "Use your CAD/KCL context and tools if useful for spatial reasoning, but this turn is for architecture planning only.",
        "Do not generate final part geometry and do not return KCL. Return the orchestration plan JSON as your final answer.",
        planner_instructions(agents_instruction, root_only=True),
        planner_input(prompt, max_agents),
    ])
    result = zookeeper_turn(
        planning_prompt,
        {"main.kcl": scratchpad},
        "zookeeper-parent-architect",
        timeout=300,
        stop_on_kcl=False,
        stop_when=lambda text: bool(parse_plan_payload(text)),
        on_dialog=on_dialog,
    )
    text = result.get("rawText") or "\n".join(result.get("dialog") or [])
    raw_plan = parse_plan_payload(text)
    if not raw_plan:
        raise RuntimeError("Zookeeper architect returned no parseable plan JSON")
    raw_plan["_planner_source"] = "zookeeper"
    raw_plan["_planner_frames"] = result.get("frames") or 0
    return raw_plan


def openai_orchestration_plan(prompt, max_agents, agents_instruction, source="openai", zookeeper_error=None):
    raw_plan = openai_json(
        "zookeeper_orchestration_plan",
        PLAN_SCHEMA,
        planner_instructions(agents_instruction, root_only=True),
        planner_input(prompt, max_agents),
        model=OPENAI_PLANNER_MODEL,
        reasoning_effort=OPENAI_ARCHITECT_REASONING_EFFORT,
        timeout=300,
    )
    raw_plan["_planner_source"] = source
    if zookeeper_error:
        raw_plan["_zookeeper_error"] = sanitize_text(zookeeper_error, "")
    return raw_plan


def normalize_sub_bom(raw_plan, max_children=None):
    children = []
    seen_keys = set()
    raw_children = raw_plan.get("children") or []
    if max_children is not None:
        raw_children = raw_children[:max_children]
    for index, raw_child in enumerate(raw_children):
        if not isinstance(raw_child, dict):
            continue
        raw_key = slug(raw_child.get("key") or raw_child.get("role") or f"component-{index + 1}")
        key = raw_key
        suffix = 2
        while key in seen_keys:
            key = f"{raw_key}-{suffix}"
            suffix += 1
        seen_keys.add(key)
        kind = "orchestrator" if raw_child.get("kind") == "orchestrator" else "worker"
        scope = sanitize_scope(raw_child.get("scope"), kind)
        if scope == "shared_part":
            kind = "worker"
        imports = raw_child.get("imports") or []
        children.append({
            "key": key,
            "kind": kind,
            "scope": scope,
            "role": sanitize_text(raw_child.get("role"), "sub-assembly" if kind == "orchestrator" else "part"),
            "instruction": sanitize_text(raw_child.get("instruction"), "Work on the assigned component with explicit interfaces."),
            "imports": unique_list(imports if isinstance(imports, list) else []),
        })
    if not children:
        raise RuntimeError("Sub-orchestrator BOM did not include direct children")
    return {
        "source": sanitize_text(raw_plan.get("_source"), "zookeeper"),
        "summary": sanitize_text(raw_plan.get("summary"), "Direct BOM planned."),
        "children": children,
        "dialog": raw_plan.get("_dialog") or [],
        "frames": int(raw_plan.get("_frames") or 0),
        "mode": "auto",
    }


def subassembly_child_capacity(body):
    try:
        requested = int(float(body.get("remainingAgentSlots", WALL_MAX_AGENTS)))
    except (TypeError, ValueError, OverflowError):
        requested = WALL_MAX_AGENTS
    return max(0, min(requested, WALL_MAX_AGENTS))


def subassembly_bom_prompt(body, agent):
    role = sanitize_text(agent.get("role"), "sub-assembly")
    name = sanitize_text(agent.get("name"), "Zookeeper Sub-Orchestrator")
    instruction = sanitize_text(agent.get("instruction"), f"Coordinate {role}.")
    root_instruction = sanitize_text(body.get("rootInstruction"), "Coordinate the complete assembly.")
    known_agents = body.get("knownAgents") or []
    child_capacity = subassembly_child_capacity(body)
    known_lines = []
    if isinstance(known_agents, list):
        for item in known_agents[:120]:
            if not isinstance(item, dict):
                continue
            known_lines.append(
                f"- {sanitize_text(item.get('name'), 'agent')} | role={sanitize_text(item.get('role'), '')} | "
                f"scope={sanitize_text(item.get('scope'), '')} | key={sanitize_text(item.get('key'), '')}"
            )
    return "\n".join([
        f"You are {name}, running as a hosted Zoo Zookeeper in auto mode.",
        wall_agents_instruction(),
        "You are planning the direct bill of materials for your own assigned sub-assembly.",
        "Do not generate KCL in this turn. Do not edit files. Return JSON only.",
        "Choose only the immediate children that you directly own. Each direct child must either be a concrete worker part or a cohesive child sub-orchestrator.",
        f"The wall has capacity for at most {child_capacity} additional agents. Return no more than {child_capacity} direct children. This is a hard deployment limit.",
        "There is no fixed maximum BOM depth. Create a child sub-orchestrator when that child has a meaningful internal assembly/BOM; the wall will recursively ask it to plan its own direct children in parallel.",
        "Do not flatten a complex subsystem merely to avoid nesting, and do not create a chain of single-child orchestrators without a real assembly responsibility.",
        "Workers model exactly one physical part. Shared/reusable hardware must be a singular worker with scope=shared_part, never a set or pack.",
        "Name direct children with physical roles and give every instruction concrete dimensions, axes, mate points, neighbors, and expected return interface where applicable.",
        "Use imports only for existing shared/reusable components or intentional cross-subassembly references listed below. Do not list new direct children in imports; the wall owns those links.",
        "Do not create new part geometry, KCL, patterns, or placement transforms in this planning turn.",
        f"Assembly prompt: {sanitize_text(body.get('prompt'), 'assembly')}",
        f"Root instruction: {root_instruction}",
        f"Your assigned role: {role}",
        f"Your assigned instruction: {instruction}",
        "Known existing agents/components:",
        "\n".join(known_lines) or "(none yet)",
        "Return JSON only with this exact shape:",
        SUB_BOM_JSON_SHAPE,
    ])


def zookeeper_subassembly_bom(body, emit_dialog=None):
    agent = body.get("agent") or {}
    child_capacity = subassembly_child_capacity(body)
    if child_capacity <= 0:
        raise RuntimeError("wall agent capacity is exhausted")
    files = body.get("files") or {}
    current_files = render_files_for_zookeeper(files) if isinstance(files, dict) else {}
    if not current_files:
        current_files = {"main.kcl": "// BOM planning only\n"}
    result = zookeeper_turn(
        subassembly_bom_prompt(body, agent),
        current_files,
        slug(f"{agent.get('name') or agent.get('role') or 'subassembly'}-bom"),
        timeout=300,
        stop_on_kcl=False,
        stop_when=lambda text: bool(parse_sub_bom_payload(text)),
        on_dialog=emit_dialog,
    )
    raw_plan = parse_sub_bom_payload(result.get("rawText") or "\n".join(result.get("dialog") or []))
    if not raw_plan:
        raise RuntimeError("Hosted Zookeeper sub-assembly planner returned no parseable BOM JSON")
    raw_plan["_source"] = "zookeeper"
    raw_plan["_dialog"] = result.get("dialog") or []
    raw_plan["_frames"] = result.get("frames") or 0
    return normalize_sub_bom(raw_plan, child_capacity)


def openai_subassembly_bom(body):
    agent = body.get("agent") or {}
    raw_plan = openai_json(
        "zookeeper_subassembly_bom",
        SUB_BOM_SCHEMA,
        subassembly_bom_prompt(body, agent),
        "Return the direct BOM JSON for this sub-assembly. Do not return KCL.",
        model=OPENAI_PLANNER_MODEL,
        reasoning_effort=OPENAI_ARCHITECT_REASONING_EFFORT,
        timeout=300,
    )
    raw_plan["_source"] = "openai_fallback"
    return normalize_sub_bom(raw_plan, subassembly_child_capacity(body))


def fallback_subassembly_bom(body, error):
    agent = body.get("agent") or {}
    role = sanitize_text(agent.get("role"), "sub-assembly")
    raw_plan = {
        "summary": f"Deterministic fallback direct BOM for {role} after planner failure: {error}",
        "children": [
            {
                "key": "structural_core",
                "kind": "worker",
                "scope": "part",
                "role": f"{role} structural core",
                "instruction": f"Model one physical structural core for {role}. Define concrete dimensions, local axes, mate points, and a renderable exported aggregate.",
                "imports": [],
            },
            {
                "key": "interface_feature",
                "kind": "worker",
                "scope": "part",
                "role": f"{role} interface feature",
                "instruction": f"Model one physical mounting or interface feature for {role}. Define concrete dimensions, local axes, mate points, and a renderable exported aggregate.",
                "imports": [],
            },
        ],
        "_source": "fallback",
    }
    return normalize_sub_bom(raw_plan, subassembly_child_capacity(body))


def subassembly_bom_stream(body, emit):
    agent = body.get("agent") or {}

    def dialog(line):
        emit({"type": "dialog", "line": line})

    try:
        dialog("Planning this sub-assembly's direct BOM through hosted Zookeeper auto mode.")
        result = zookeeper_subassembly_bom(body, emit_dialog=dialog)
    except Exception as zoo_error:
        dialog(f"Hosted BOM planning failed: {sanitize_dialog_text(zoo_error, 'unknown error')}")
        try:
            dialog(f"OpenAI fallback is planning {sanitize_text(agent.get('role'), 'the sub-assembly')}'s direct BOM; it does not emit Zoo websocket frames.")
            result = openai_subassembly_bom(body)
            dialog("OpenAI fallback returned the direct BOM.")
        except Exception as openai_error:
            dialog(f"OpenAI BOM fallback failed: {sanitize_dialog_text(openai_error, 'unknown error')}")
            result = fallback_subassembly_bom(body, openai_error)
            dialog("Deterministic direct BOM fallback returned two concrete workers.")
    result["streamed"] = True
    emit({"type": "final", "update": result})


def architecture_bom_feed(plan):
    agents = plan.get("agents") if isinstance(plan, dict) else []
    if not isinstance(agents, list):
        return []
    orchestrators = [agent for agent in agents if isinstance(agent, dict) and agent.get("kind") == "orchestrator"]
    workers = [agent for agent in agents if isinstance(agent, dict) and agent.get("kind") == "worker"]
    shared = [agent for agent in workers if sanitize_scope(agent.get("scope"), "worker") == "shared_part"]
    top_level = [
        sanitize_text(agent.get("role"), "sub-assembly")
        for agent in orchestrators
        if agent.get("parentId") == ROOT_AGENT_ID and "reusable" not in str(agent.get("role") or "").lower()
    ]
    shared_roles = [sanitize_text(agent.get("role"), "shared component") for agent in shared]
    messages = [
        f"Architecture selected {len(orchestrators)} orchestrator(s) and {len(workers)} worker part file(s).",
    ]
    if top_level:
        messages.append(f"Top-level sub-assemblies: {', '.join(top_level[:8])}{' ...' if len(top_level) > 8 else ''}.")
    if shared_roles:
        messages.append(f"Reusable BOM: {len(shared_roles)} canonical component(s): {', '.join(shared_roles[:10])}{' ...' if len(shared_roles) > 10 else ''}.")
    else:
        messages.append("Reusable BOM: no shared components were selected in this first architecture pass.")
    messages.append("BOM ownership: workers make singular parts; orchestrators clone, mirror, and pattern repeated instances.")
    return messages


def orchestrate(body, emit=None):
    def report(event_type, message):
        if emit is None:
            return
        formatter = sanitize_dialog_text if event_type == "dialog" else sanitize_text
        emit({"type": event_type, "message": formatter(message, "Architect update.")})

    prompt = sanitize_text(body.get("prompt"), "Design a small rocket engine assembly")
    max_agents = WALL_MAX_AGENTS
    if body.get("maxAgents") not in (None, ""):
        try:
            requested_max_agents = int(float(body.get("maxAgents")))
        except (TypeError, ValueError, OverflowError):
            requested_max_agents = 0
        if requested_max_agents > 0:
            max_agents = min(requested_max_agents, WALL_MAX_AGENTS)
    agents_instruction = wall_agents_instruction()
    zookeeper_error = None
    report("started", "Connecting the hosted Zookeeper architect in auto mode.")
    report("status", "Interpreting the assembly request and selecting top-level sub-assembly boundaries.")
    report("status", "Each sub-orchestrator will plan its own direct BOM concurrently after this scaffold is accepted.")
    try:
        plan = normalize_plan(
            zookeeper_orchestration_plan(
                prompt,
                max_agents,
                agents_instruction,
                on_dialog=lambda line: report("dialog", line),
            ),
            prompt,
            max_agents,
        )
        report("status", "Hosted architect returned the top-level scaffold; checking hierarchy and import ownership.")
        for message in architecture_bom_feed(plan):
            report("bom", message)
        if emit is not None:
            emit({"type": "final", "plan": plan})
        return plan
    except Exception as error:
        zookeeper_error = str(error)
        report("dialog", f"Hosted Zookeeper architect failed: {sanitize_dialog_text(zookeeper_error, 'unknown error')}")
        report("status", "Hosted architect was unavailable; switching to the OpenAI architecture fallback.")

    try:
        report("dialog", f"OpenAI fallback is planning the root scaffold with {OPENAI_PLANNER_MODEL}; it does not emit Zoo websocket frames.")
        report("status", "OpenAI architect is building the top-level sub-assembly graph and reusable BOM.")
        plan = normalize_plan(
            openai_orchestration_plan(
                prompt,
                max_agents,
                agents_instruction,
                source="openai_fallback",
                zookeeper_error=zookeeper_error,
            ),
            prompt,
            max_agents,
        )
        report("dialog", "OpenAI fallback returned the root scaffold; sub-orchestrators will now plan their BOMs independently.")
        for message in architecture_bom_feed(plan):
            report("bom", message)
        if emit is not None:
            emit({"type": "final", "plan": plan})
        return plan
    except Exception as error:
        report("dialog", f"OpenAI fallback failed: {sanitize_dialog_text(error, 'unknown error')}")
        plan = fallback_plan(
            prompt,
            max_agents,
            f"Zookeeper orchestration failed: {zookeeper_error}; OpenAI orchestration failed: {error}",
        )
        report("status", "Architecture services were unavailable; using the deterministic wall fallback plan.")
        report("dialog", "Deterministic fallback plan accepted; it has no architect reasoning frames.")
        for message in architecture_bom_feed(plan):
            report("bom", message)
        if emit is not None:
            emit({"type": "final", "plan": plan})
        return plan


def agent_work(body):
    agent = body.get("agent") or {}
    role = sanitize_text(agent.get("role"), "part")
    imports = extract_import_lines(body.get("currentKcl"))
    current_kcl = str(body.get("currentKcl") or "")
    render_error = sanitize_text(body.get("renderError"), "")
    attempt = int(clamp(float(body.get("attempt") or 0), 0, 4))
    try:
        return zookeeper_agent_work(body, agent, imports, current_kcl, render_error, attempt)
    except Exception as error:
        return retained_kcl_fallback(role, imports, current_kcl, error)


def retained_kcl_fallback(role, imports, current_kcl, error):
    body_kcl = strip_import_lines(current_kcl)
    return {
        "source": "fallback",
        "summary": f"Retained existing KCL for {role}; hosted Zookeeper auto failed: {error}",
        "kcl": attach_imports(imports, body_kcl),
        "dialog": [],
        "frames": 0,
        "drafts": 0,
        "mode": "auto",
    }


def event_queue_for(session_id):
    key = str(session_id or "default")
    with EVENT_QUEUES_LOCK:
        if key not in EVENT_QUEUES:
            EVENT_QUEUES[key] = queue.Queue()
        return EVENT_QUEUES[key]


def publish_event(session_id, event):
    event_queue_for(session_id).put(event)


def agent_work_stream(body, emit):
    agent = body.get("agent") or {}
    role = sanitize_text(agent.get("role"), "part")
    imports = extract_import_lines(body.get("currentKcl"))
    current_kcl = str(body.get("currentKcl") or "")
    render_error = sanitize_text(body.get("renderError"), "")
    attempt = int(clamp(float(body.get("attempt") or 0), 0, 4))
    try:
        result = zookeeper_agent_work(body, agent, imports, current_kcl, render_error, attempt, emit=emit)
    except Exception as error:
        result = retained_kcl_fallback(role, imports, current_kcl, error)
    result["streamed"] = True
    emit({"type": "final", "update": result})


def agent_work_start(body):
    session_id = sanitize_text(body.get("sessionId"), "default")
    work_id = sanitize_text(body.get("workId"), str(uuid.uuid4()))
    agent = body.get("agent") or {}
    agent_id = sanitize_text(agent.get("id"), "agent")

    def emit(event):
        payload = dict(event)
        payload["sessionId"] = session_id
        payload["workId"] = work_id
        payload["agentId"] = agent_id
        publish_event(session_id, payload)

    def run():
        try:
            emit({"type": "started"})
            agent_work_stream(body, emit)
        except Exception as error:
            emit({"type": "error", "summary": str(error)})

    thread = threading.Thread(target=run, name=f"zookeeper-work-{agent_id}", daemon=True)
    thread.start()
    return {"ok": True, "sessionId": session_id, "workId": work_id, "agentId": agent_id}


def agent_bom_start(body):
    session_id = sanitize_text(body.get("sessionId"), "default")
    work_id = sanitize_text(body.get("workId"), str(uuid.uuid4()))
    agent = body.get("agent") or {}
    agent_id = sanitize_text(agent.get("id"), "agent")

    def emit(event):
        payload = dict(event)
        payload["sessionId"] = session_id
        payload["workId"] = work_id
        payload["agentId"] = agent_id
        publish_event(session_id, payload)

    def run():
        try:
            emit({"type": "started"})
            subassembly_bom_stream(body, emit)
        except Exception as error:
            emit({"type": "error", "summary": str(error)})

    thread = threading.Thread(target=run, name=f"zookeeper-bom-{agent_id}", daemon=True)
    thread.start()
    return {"ok": True, "sessionId": session_id, "workId": work_id, "agentId": agent_id}


class WallHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path)
        requested = urllib.parse.unquote(parsed.path)
        if requested == "/":
            requested = "/index.html"
        resolved = (PUBLIC_DIR / requested.lstrip("/")).resolve()
        try:
            resolved.relative_to(PUBLIC_DIR)
        except ValueError:
            return str(PUBLIC_DIR / "__forbidden__")
        return str(resolved)

    def end_headers(self):
        if self.path.endswith(".html") or self.path.endswith(".js") or self.path.startswith("/api/"):
            self.send_header("cache-control", "no-store")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".wasm"):
            return "application/wasm"
        return mimetypes.guess_type(path)[0] or "application/octet-stream"

    def read_json(self):
        length = int(self.headers.get("content-length") or "0")
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_json(self, status, value):
        payload = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(payload)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def start_ndjson(self):
        self.send_response(200)
        self.send_header("content-type", "application/x-ndjson; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("x-accel-buffering", "no")
        self.end_headers()

    def send_ndjson(self, value):
        payload = (json.dumps(value) + "\n").encode("utf-8")
        self.wfile.write(payload)
        self.wfile.flush()

    def send_event_stream(self, session_id):
        self.start_ndjson()
        events = event_queue_for(session_id)
        while True:
            try:
                event = events.get(timeout=15)
            except queue.Empty:
                event = {"type": "ping", "sessionId": session_id, "time": time.time()}
            try:
                self.send_ndjson(event)
            except (BrokenPipeError, ConnectionError):
                return

    def send_wall_config(self):
        token = json.dumps(ZOO_API_TOKEN) if ZOO_API_TOKEN else "undefined"
        payload = f"window.ZOO_API_TOKEN = {token};\n".encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "text/javascript; charset=utf-8")
        self.send_header("content-length", str(len(payload)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/zookeeper/events":
            params = urllib.parse.parse_qs(parsed.query)
            session_id = sanitize_text((params.get("sessionId") or ["default"])[0], "default")
            self.send_event_stream(session_id)
            return
        if parsed.path == "/config.js":
            self.send_wall_config()
            return
        super().do_GET()

    def do_POST(self):
        try:
            if self.path == "/api/orchestrate":
                self.send_json(200, orchestrate(self.read_json()))
                return
            if self.path == "/api/orchestrate-stream":
                body = self.read_json()
                self.start_ndjson()
                try:
                    orchestrate(body, self.send_ndjson)
                except Exception as error:
                    self.send_ndjson({"type": "error", "summary": str(error)})
                return
            if self.path == "/api/zookeeper/work":
                self.send_json(200, agent_work(self.read_json()))
                return
            if self.path == "/api/zookeeper/work-stream":
                body = self.read_json()
                self.start_ndjson()
                agent_work_stream(body, self.send_ndjson)
                return
            if self.path == "/api/zookeeper/work-start":
                self.send_json(200, agent_work_start(self.read_json()))
                return
            if self.path == "/api/zookeeper/bom-start":
                self.send_json(200, agent_bom_start(self.read_json()))
                return
            if self.path == "/api/zookeeper/review":
                self.send_json(200, zookeeper_review(self.read_json()))
                return
            if self.path == "/api/snapshot":
                self.send_json(200, persist_snapshot(self.read_json()))
                return
            self.send_error(404)
        except Exception as error:
            error_id = uuid.uuid4().hex[:12]
            log_event("http.error", {
                "errorId": error_id,
                "method": "POST",
                "path": self.path,
                "error": str(error),
                "errorType": type(error).__name__,
                "traceback": traceback.format_exc(),
            })
            self.send_json(500, {"error": str(error), "errorId": error_id})


if __name__ == "__main__":
    os.chdir(PUBLIC_DIR)
    print(f"web-view wall server listening on http://127.0.0.1:{PORT}")
    if OPENAI_API_KEY:
        print(f"OpenAI model: {OPENAI_MODEL}")
        print(f"OpenAI planner model: {OPENAI_PLANNER_MODEL}")
        print(f"OpenAI planner reasoning effort: {OPENAI_ARCHITECT_REASONING_EFFORT}")
    else:
        print("OPENAI_API_KEY is not set; fallback plans will be used.")
    ThreadingHTTPServer(("127.0.0.1", PORT), WallHandler).serve_forever()
