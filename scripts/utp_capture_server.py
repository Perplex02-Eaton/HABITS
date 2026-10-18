#!/usr/bin/env python3
"""
HABITS ⇄ UTP+class · Receptor local de la sesión (localhost:8899)
================================================================
El bookmarklet (scripts/utp-sync-bookmarklet.js) se ejecuta DENTRO de
class.utp.edu.pe, con tu sesión ya iniciada. Envía aquí:

  POST /utp-sync   {"session": {...tokens/ids...}, "activities": {...respuesta API...}}

y este proceso escribe, sólo en tu PC:
  ~/.hermes/utp_state.json    tokens (no salen de la máquina)
  public/utp-tasks.json       tareas listas para HABITS / JARVIS

Arranque:  python scripts/utp_capture_server.py [--port 8899]
Dejar corriendo mientras usas el bookmarklet (Ctrl+C para salir).
"""

import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utp_sync import (  # noqa: E402
    STATE_FILE, TASKS_FILE, load_state, save_state, parse_activities, write_tasks_file,
)

ALLOWED_ORIGINS = (
    "https://class.utp.edu.pe",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://habitset.netlify.app",
)
PORT = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8899


def merge_session(payload):
    s = load_state()
    incoming = payload.get("session") or {}
    for k in ("access_token", "refresh_token", "id_token", "user_id", "tenant_id", "email"):
        v = incoming.get(k)
        if v:
            s[k] = v
    s["captured_at"] = int(time.time())
    s.setdefault("user_id", incoming.get("user_id", ""))
    save_state(s)
    return s


class Handler(BaseHTTPRequestHandler):
    server_version = "HabitsUtpCapture/1.0"

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/status"):
            s = load_state()
            self._json(200, {
                "ok": True,
                "captured_at": s.get("captured_at", 0),
                "user_id": s.get("user_id", ""),
                "access_token_len": len(s.get("access_token", "") or ""),
                "tasks_file": TASKS_FILE,
                "tasks_file_exists": os.path.exists(TASKS_FILE),
            })
        else:
            self._json(404, {"ok": False, "error": "usa POST /utp-sync"})

    def do_POST(self):
        if not self.path.startswith("/utp-sync"):
            self._json(404, {"ok": False, "error": "ruta desconocida"})
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(n) or b"{}")
        except Exception as e:
            self._json(400, {"ok": False, "error": "JSON invalido: %s" % e})
            return

        try:
            s = merge_session(payload)
            acts = payload.get("activities")
            tasks = parse_activities(acts) if acts else []
            if tasks:
                out = write_tasks_file(tasks, source="utp-bookmarklet")
                total = out["count"]
            else:
                total = len((payload.get("tasks") or [])) or 0
                if total:
                    out = write_tasks_file(payload["tasks"], source="utp-bookmarklet")
                    total = out["count"]
            self._json(200, {
                "ok": True,
                "user_id": s.get("user_id", ""),
                "session_keys": [k for k in ("access_token", "refresh_token", "user_id", "tenant_id") if s.get(k)],
                "nuevas": len(tasks),
                "total": total,
                "tasks_file": TASKS_FILE,
            })
        except Exception as e:
            self._json(500, {"ok": False, "error": repr(e)[:200]})

    def log_message(self, fmt, *args):
        sys.stderr.write("[utp-capture] " + (fmt % args) + "\n")


if __name__ == "__main__":
    print("Receptor UTP escuchando en http://127.0.0.1:%d" % PORT)
    print("  estado  : http://127.0.0.1:%d/status" % PORT)
    print("  salida  : %s" % TASKS_FILE)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
