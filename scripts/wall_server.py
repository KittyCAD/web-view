#!/usr/bin/env python3
import json
import mimetypes
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("PORT", "3000"))
PUBLIC_DIR = Path(os.environ.get("WALL_PUBLIC_DIR", Path.cwd() / "public")).resolve()
ZOO_API_TOKEN = os.environ.get("ZOO_API_TOKEN") or None
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY") or None
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1")


PLANNER_SYSTEM_PROMPT = """
You are the Zookeeper Orchestrator for a nine-screen CAD wall demo.
Given the user's assembly prompt, produce a compact JSON object that assigns
the assembly into between 3 and 8 visually distinct CAD parts. Each part will be
rendered by a separate worker screen and placed into a combined center assembly.
Return JSON only with this exact shape:
{
  "title": "short assembly title",
  "summary": "one sentence about the decomposition",
  "parts": [
    {
      "name": "short part name",
      "role": "what this part does",
      "description": "specific local modeling instruction for the worker",
      "color": "#RRGGBB",
      "width": 1.2,
      "height": 0.8,
      "depth": 0.9,
      "position": {"x": -2.5, "y": 1.0, "z": 0.6}
    }
  ]
}
Use dimensions roughly in the 0.4 to 3.0 range. Spread positions across x
-4.0..4.0 and y -2.2..2.2 so parts do not overlap. Keep z around 0.4..1.2.
Do not include markdown, comments, imports, or extra keys.
""".strip()


def send_json(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def request_openai_plan(prompt):
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set on the wall server")

    request_body = json.dumps({
        "model": OPENAI_MODEL,
        "temperature": 0.35,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=request_body,
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"OpenAI planner returned HTTP {error.code}: {detail}") from error

    payload = json.loads(raw)
    content = payload["choices"][0]["message"]["content"]
    return json.loads(content)


class WallHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        request_path = path.split("?", 1)[0].split("#", 1)[0]
        request_path = request_path.lstrip("/") or "index.html"
        return str((PUBLIC_DIR / request_path).resolve())

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/config.js":
            body = f"window.ZOO_API_TOKEN = {json.dumps(ZOO_API_TOKEN)};\n".encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/plan":
            send_json(self, 404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 20000:
                raise ValueError("invalid prompt body length")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            prompt = payload.get("prompt", "")
            if not isinstance(prompt, str) or not prompt.strip():
                raise ValueError("prompt is required")
            plan = request_openai_plan(prompt.strip())
            send_json(self, 200, {"plan": plan})
        except Exception as error:
            send_json(self, 500, {"error": str(error)})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


mimetypes.add_type("application/wasm", ".wasm")

if __name__ == "__main__":
    os.chdir(PUBLIC_DIR)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), WallHandler)
    print(f"Zoo Web View Wall serving {PUBLIC_DIR} on http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
