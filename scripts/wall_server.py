#!/usr/bin/env python3
import base64
import hashlib
import json
import mimetypes
import os
import re
import socket
import ssl
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("PORT", "3000"))
PUBLIC_DIR = Path(os.environ.get("WALL_PUBLIC_DIR", Path.cwd() / "public")).resolve()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
OPENAI_PLANNER_MODEL = os.environ.get("OPENAI_PLANNER_MODEL", OPENAI_MODEL)
ZOO_API_TOKEN = os.environ.get("ZOO_API_TOKEN")
ZOO_WS_HOST = os.environ.get("ZOO_WS_HOST", "api.zoo.dev")
ZOO_WS_PATH = os.environ.get("ZOO_WS_PATH", "/ws/ml/copilot")
ROOT_AGENT_ID = "zookeeper-orchestrator-root"
ROOT_FILE_PATH = "main.kcl"
MAX_DEFAULT_AGENTS = 50
WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

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
            "source": "fallback",
        })
    return seeds[:max_agents]


def build_files(agents):
    files = {}
    top_level_files = [
        agent["filePath"] for agent in agents
        if agent["parentId"] == ROOT_AGENT_ID
    ]
    files[ROOT_FILE_PATH] = main_file_for(top_level_files)
    for agent in agents:
        child_files = [
            child["filePath"] for child in agents
            if child["parentId"] == agent["id"]
        ]
        files[agent["filePath"]] = main_file_for(child_files)
    return files


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
                    "role": {"type": "string"},
                    "instruction": {"type": "string"},
                },
                "required": ["key", "parent_key", "kind", "role", "instruction"],
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


def output_text(data):
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    chunks = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            if isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks)


def openai_json(name, schema, instructions, input_text, model=None):
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
        with urllib.request.urlopen(request, timeout=90) as response:
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
    if isinstance(frame.get("delta"), str):
        return frame["delta"]
    if isinstance(frame.get("whole_response"), str):
        return frame["whole_response"]
    for value in iter_json_values(frame):
        if isinstance(value, dict):
            if isinstance(value.get("detail"), str) and "error" in json.dumps(frame)[:100].lower():
                return f"error: {value['detail']}"
            if isinstance(value.get("delta"), str):
                return value["delta"]
            if isinstance(value.get("whole_response"), str):
                return value["whole_response"]
            if isinstance(value.get("content"), str) and ("reason" in frame_marker or "markdown" in str(value.get("type", "")).lower()):
                return value["content"]
            if isinstance(value.get("msg"), str):
                return value["msg"]
            if isinstance(value.get("message"), str):
                return value["message"]
    return None


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


def zookeeper_turn(user_message, current_files, project_name, timeout=300, stop_on_kcl=True):
    sock = websocket_connect(timeout=30)
    started = time.monotonic()
    frames = []
    latest_kcl = None
    dialog = []
    raw_dialog = []
    final_text = ""
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
                raw_dialog.append(line)
                dialog.append(sanitize_text(line, line))
                if isinstance(frame, dict) and isinstance(frame.get("whole_response"), str):
                    final_text = frame["whole_response"]
            kcl = extract_kcl_output(frame)
            if kcl:
                latest_kcl = kcl
                if stop_on_kcl:
                    break
            if is_error_frame(frame):
                raise RuntimeError(extract_dialog_line(frame) or "Zookeeper websocket returned an error")
            if is_end_of_stream(frame):
                break
        else:
            raise RuntimeError("Zookeeper websocket turn timed out")
    finally:
        websocket_close(sock)
    return {
        "kcl": latest_kcl,
        "summary": sanitize_text(final_text or (dialog[-1] if dialog else ""), "Zookeeper auto completed."),
        "rawText": final_text or "\n".join(raw_dialog[-24:]),
        "dialog": dialog[-12:],
        "frames": len(frames),
    }


def build_zookeeper_agent_prompt(body, agent, current_kcl, imports, render_error, attempt):
    role = sanitize_text(agent.get("role"), "part")
    instruction = sanitize_text(agent.get("instruction"), f"Work on {role}.")
    kind = sanitize_text(agent.get("kind"), "worker")
    name = sanitize_text(agent.get("name"), "Zookeeper Agent")
    root_instruction = sanitize_text(body.get("rootInstruction"), "Coordinate the assembly.")
    assembly_prompt = sanitize_text(body.get("prompt"), "assembly")
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
            "You are an assembly orchestrator. Your job is placement only.",
            f"Assembly prompt: {assembly_prompt}",
            f"Parent/root instruction: {root_instruction}",
            f"Assigned role: {role}",
            f"Assigned instruction: {instruction}",
            "Edit the provided project file named main.kcl.",
            "You may import child components with aliases, clone imported components, hide raw imports, and use translate(), rotate(), scale(), and appearance() to place components.",
            "Do not create part geometry. Do not use startSketchOn, startProfile, line, circle, close, extrude, revolve, subtract, boolean tools, or new primitive solids.",
            "Keep each child part as a separate imported component and arrange those components into the assembly.",
            "The wall server preserves import lines from the current file, so write the placement body that references those aliases.",
            f"Placement/review attempt: {attempt}",
            repair_text,
            review_text,
            "Existing import lines and aliases available to place:",
            imports or "(none)",
            "Current placement body:",
            strip_import_lines(current_kcl)[:6000] or "(empty)",
        ])
    return "\n".join([
        f"You are {name}, running as a hosted Zoo Zookeeper in auto mode.",
        f"Assembly prompt: {assembly_prompt}",
        f"Parent/root instruction: {root_instruction}",
        f"Agent kind: {kind}",
        f"Assigned role: {role}",
        f"Assigned instruction: {instruction}",
        "Edit the provided project file named main.kcl.",
        "This wall server maps your main.kcl output back into the agent's assigned file path.",
        "Import lines are managed by the wall server; keep your output self-contained and do not rely on editing sibling files.",
        "Use Zoo's CAD/KCL tools to write, inspect, execute, and repair the KCL instead of guessing.",
        "Return a complete renderable KCL model for this one part or sub-assembly.",
        f"Repair attempt: {attempt}",
        repair_text,
        review_text,
        "Existing import lines that the wall server will preserve outside your editable body:",
        imports or "(none)",
        "Current KCL body:",
        strip_import_lines(current_kcl)[:6000] or "(empty)",
    ])


def zookeeper_agent_work(body, agent, imports, current_kcl, render_error, attempt):
    project_name = slug(agent.get("name") or agent.get("role") or "zookeeper-agent")
    prompt = build_zookeeper_agent_prompt(body, agent, current_kcl, imports, render_error, attempt)
    if sanitize_text(agent.get("kind"), "worker") == "orchestrator":
        files = body.get("files") or {}
        current_files = render_files_for_zookeeper(files)
        current_files["main.kcl"] = rewrite_import_paths_for_render(current_kcl, list(files.keys()))
    else:
        current_files = {"main.kcl": strip_import_lines(current_kcl)}
    result = zookeeper_turn(prompt, current_files, project_name)
    if not result.get("kcl"):
        raise RuntimeError("Zookeeper completed without an EditKclCode output")
    body_kcl = clean_model_kcl(result["kcl"])
    return {
        "source": "zookeeper",
        "summary": result["summary"],
        "kcl": attach_imports(rewrite_import_paths_for_render(imports, (body.get("files") or {}).keys()), body_kcl),
        "dialog": result["dialog"],
        "frames": result["frames"],
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
            if isinstance(payload.get("rework") or payload.get("changes"), list)
        ),
        payloads[-1] if payloads else {},
    )


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


def zookeeper_review(body):
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
    child_list = body.get("children") or []
    child_lines = []
    if isinstance(child_list, list):
        for item in child_list[:24]:
            if not isinstance(item, dict):
                continue
            child_lines.append(
                f"- {sanitize_text(item.get('name'), 'child')} | role={sanitize_text(item.get('role'), '')} | file={sanitize_text(item.get('filePath'), '')}"
            )
    prompt = "\n".join([
        f"You are {name}, running as a hosted Zoo Zookeeper in auto mode.",
        "You are reviewing a CAD assembly after a child agent returned KCL.",
        "Use Zoo's CAD/KCL tools to inspect or execute the provided project visually.",
        "Do not edit files in this review turn.",
        f"Assembly prompt: {sanitize_text(body.get('prompt'), 'assembly')}",
        f"Orchestrator role: {role}",
        f"Orchestrator entry file: {agent_file}",
        f"Recent child update: {child_name} / {child_role} / {child_file}",
        "Available child agents that can receive rework:",
        "\n".join(child_lines) or "(none)",
        "Decide whether any child needs rework based on the visual/model result and interface fit.",
        "Return JSON only with this exact shape:",
        '{"summary":"one sentence visual review","rework":[{"target":"exact child role/name/file when possible","reason":"why","instruction":"specific rework request for that child"}]}',
        "If no rework is needed, return an empty rework array.",
    ])
    result = zookeeper_turn(
        prompt,
        current_files,
        slug(name or role or "zookeeper-review"),
        timeout=240,
        stop_on_kcl=False,
    )
    text = result.get("rawText") or result["summary"] or "\n".join(result["dialog"])
    payload = parse_review_payload(text)
    return {
        "source": "zookeeper",
        "summary": sanitize_text(payload.get("summary") if isinstance(payload, dict) else text, "Visual review completed."),
        "rework": parse_rework_items(payload),
        "dialog": result["dialog"],
        "frames": result["frames"],
        "mode": "auto",
    }


def normalize_plan(raw_plan, prompt, max_agents):
    raw_agents = list(raw_plan.get("agents") or [])[:max_agents]
    if not raw_agents:
        raise RuntimeError("OpenAI plan did not include agents")

    key_to_id = {}
    orchestrator_count = 0
    worker_count = 0
    for raw_agent in raw_agents:
        kind = "orchestrator" if raw_agent.get("kind") == "orchestrator" else "worker"
        if kind == "orchestrator":
            orchestrator_count += 1
            key_to_id[str(raw_agent.get("key"))] = f"sub-orchestrator-{orchestrator_count:04d}"
        else:
            worker_count += 1
            key_to_id[str(raw_agent.get("key"))] = f"worker-{worker_count:04d}"

    agents = []
    for raw_agent in raw_agents:
        kind = "orchestrator" if raw_agent.get("kind") == "orchestrator" else "worker"
        agent_id = key_to_id[str(raw_agent.get("key"))]
        parent_key = str(raw_agent.get("parent_key") or "root")
        parent_id = ROOT_AGENT_ID if parent_key == "root" else key_to_id.get(parent_key, ROOT_AGENT_ID)
        sequence = re.search(r"(\d{4})$", agent_id).group(1)
        label = "Sub-Orchestrator" if kind == "orchestrator" else "Worker"
        role = sanitize_text(raw_agent.get("role"), "sub-assembly" if kind == "orchestrator" else "part")
        agents.append({
            "id": agent_id,
            "parentId": parent_id,
            "kind": kind,
            "name": f"Zookeeper {label} {sequence}",
            "role": role,
            "instruction": sanitize_text(raw_agent.get("instruction"), f"Work on {role}."),
            "filePath": f"generated/{slug(role)}-{sequence}.kcl",
            "source": "openai",
        })

    return {
        "sessionId": str(uuid.uuid4()),
        "source": "openai",
        "prompt": prompt,
        "root": {
            "instruction": sanitize_text(raw_plan.get("root_instruction"), f"Coordinate the generated assembly for: {prompt}"),
            "filePath": ROOT_FILE_PATH,
        },
        "agents": agents,
        "files": build_files(agents),
        "notes": [f"OpenAI planner model: {OPENAI_PLANNER_MODEL}"],
    }


def orchestrate(body):
    prompt = sanitize_text(body.get("prompt"), "Design a small rocket engine assembly")
    max_agents = int(clamp(float(body.get("maxAgents") or MAX_DEFAULT_AGENTS), 1, MAX_DEFAULT_AGENTS))
    try:
        raw_plan = openai_json(
            "zookeeper_orchestration_plan",
            PLAN_SCHEMA,
            " ".join([
                "You are the parent Zookeeper Orchestrator for a CAD wall demo.",
                "Create a nested plan of sub-orchestrators and workers for the requested assembly.",
                "Use parent_key root for top-level sub-orchestrators.",
                "Choose the number of agents that fits the requested assembly instead of filling the maximum.",
                "For moderately complex mechanical assemblies, prefer roughly 15 to 25 agents unless the prompt clearly needs fewer or more.",
                "Workers should own concrete CAD parts. Orchestrators should own sub-assemblies.",
                "Keep roles short, physical, and suitable as graph labels.",
            ]),
            f"Prompt: {prompt}\nMaximum agents: {max_agents}",
            model=OPENAI_PLANNER_MODEL,
        )
        return normalize_plan(raw_plan, prompt, max_agents)
    except Exception as error:
        return fallback_plan(prompt, max_agents, f"OpenAI orchestration failed: {error}")


def agent_work(body):
    agent = body.get("agent") or {}
    role = sanitize_text(agent.get("role"), "part")
    match = re.search(r"(\d{4})$", str(agent.get("id") or "0001"))
    index = int(match.group(1)) if match else 1
    imports = extract_import_lines(body.get("currentKcl"))
    current_kcl = str(body.get("currentKcl") or "")
    render_error = sanitize_text(body.get("renderError"), "")
    attempt = int(clamp(float(body.get("attempt") or 0), 0, 4))
    fallback_color = color_for(agent.get("id") or role)
    try:
        return zookeeper_agent_work(body, agent, imports, current_kcl, render_error, attempt)
    except Exception as error:
        body_kcl = strip_import_lines(current_kcl)
        return {
            "source": "fallback",
            "summary": f"Retained existing KCL for {role}; hosted Zookeeper auto failed: {error}",
            "kcl": attach_imports(imports, body_kcl),
            "dialog": [],
            "frames": 0,
            "mode": "auto",
        }


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
        if urllib.parse.urlparse(self.path).path == "/config.js":
            self.send_wall_config()
            return
        super().do_GET()

    def do_POST(self):
        try:
            if self.path == "/api/orchestrate":
                self.send_json(200, orchestrate(self.read_json()))
                return
            if self.path == "/api/zookeeper/work":
                self.send_json(200, agent_work(self.read_json()))
                return
            if self.path == "/api/zookeeper/review":
                self.send_json(200, zookeeper_review(self.read_json()))
                return
            self.send_error(404)
        except Exception as error:
            self.send_json(500, {"error": str(error)})


if __name__ == "__main__":
    os.chdir(PUBLIC_DIR)
    print(f"web-view wall server listening on http://127.0.0.1:{PORT}")
    if OPENAI_API_KEY:
        print(f"OpenAI model: {OPENAI_MODEL}")
        print(f"OpenAI planner model: {OPENAI_PLANNER_MODEL}")
    else:
        print("OPENAI_API_KEY is not set; fallback plans will be used.")
    ThreadingHTTPServer(("127.0.0.1", PORT), WallHandler).serve_forever()
