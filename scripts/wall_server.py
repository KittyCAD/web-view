#!/usr/bin/env python3
import json
import mimetypes
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("PORT", "3000"))
PUBLIC_DIR = Path(os.environ.get("WALL_PUBLIC_DIR", Path.cwd() / "public")).resolve()
ZOO_API_TOKEN = os.environ.get("ZOO_API_TOKEN") or None


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

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


mimetypes.add_type("application/wasm", ".wasm")

if __name__ == "__main__":
    os.chdir(PUBLIC_DIR)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), WallHandler)
    print(f"Zoo Web View Wall serving {PUBLIC_DIR} on http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
