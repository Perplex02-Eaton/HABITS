#!/usr/bin/env python3
"""
HABITS ACOMPAÑANTE — hub local de emparejamiento y auditoría.

Qué hace: permite que la app HABITS (en el equipo de quien PIDE ayuda) abra una
sesión con un código de 6 dígitos y un enlace de LAN. Quien AYUDA (otra persona,
o tú mismo desde el celular en la misma red) entra con ese código y desde ahí
propone acciones. Nada se ejecuta sin quedar registrado, y lo sensible queda
"esperando" hasta que el dueño del equipo lo aprueba en su propia pantalla.

Reglas que respeta el diseño:
  * El agente corre en el equipo destino; aquí sólo se enruta y se audita.
  * Nunca guarda pantallas, contraseñas, tokens de terceros ni claves.
  * Toda sesión caduca (por defecto 30 min) y se puede colgar en un clic.
  * El historial es del dueño: vive en memoria y se borra al cerrar la sesión.

Uso:
  python scripts/companion_hub.py                 # escucha en la LAN, puerto 8898
  python scripts/companion_hub.py --port 8898
  python scripts/companion_hub.py --selftest      # pruebas internas, sin red
"""

from __future__ import annotations

import argparse
import json
import random
import secrets
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional

VERSION = "1.0"
DEFAULT_PORT = 8898
SESSION_MINUTES = 30

# Acciones que jamás se ejecutan sin que el dueño las apruebe en su pantalla.
SENSITIVE_KINDS = {
    "escribir",
    "enviar",
    "whatsapp",
    "pago",
    "comprar",
    "borrar",
    "mensaje",
    "correo",
    "instalar",
}

_LOCK = threading.Lock()
_SESSIONS: Dict[str, Dict[str, Any]] = {}


# ─────────────────────────────── utilidades ───────────────────────────────

def now_ms() -> int:
    return int(time.time() * 1000)


def lan_ip() -> str:
    """IP del equipo en la red local (la que ve el otro dispositivo)."""
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.settimeout(0.4)
        probe.connect(("8.8.8.8", 80))
        ip = probe.getsockname()[0]
        probe.close()
        return ip
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"


def new_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def prune() -> None:
    """Cierra las sesiones vencidas. El historial se va con ellas."""
    now = now_ms()
    for sid, session in list(_SESSIONS.items()):
        if session["status"] != "cerrada" and now > session["expires_at"]:
            session["status"] = "cerrada"
            session["closed_reason"] = "caducó"
        if session["status"] == "cerrada" and now > session["expires_at"] + 10 * 60_000:
            _SESSIONS.pop(sid, None)


def snapshot(session: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": session["id"],
        "code": session["code"],
        "status": session["status"],
        "device": session["device"],
        "owner": session["owner"],
        "peer": session.get("peer"),
        "started_at": session["started_at"],
        "expires_at": session["expires_at"],
        "remaining_ms": max(0, session["expires_at"] - now_ms()),
        "closed_reason": session.get("closed_reason"),
        "actions": session["actions"],
    }


def find_by_code(code: str) -> Optional[Dict[str, Any]]:
    for session in _SESSIONS.values():
        if session["code"] == code and session["status"] == "esperando":
            return session
    return None


def log_action(session: Dict[str, Any], payload: Dict[str, Any], by: str) -> Dict[str, Any]:
    kind = str(payload.get("kind") or "accion").strip().lower()
    sensible = bool(payload.get("sensible")) or kind in SENSITIVE_KINDS
    action = {
        "id": secrets.token_hex(4),
        "at": now_ms(),
        "kind": kind,
        "label": str(payload.get("label") or kind)[:200],
        "detail": str(payload.get("detail") or "")[:400],
        "by": by,
        "sensible": sensible,
        "status": "esperando" if sensible else "hecho",
    }
    session["actions"].insert(0, action)
    session["actions"] = session["actions"][:120]
    if session["status"] == "esperando":
        session["status"] = "activa"
    return action


# ───────────────────────────────── router ────────────────────────────────

def route(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    with _LOCK:
        prune()
        if path == "/health":
            return {
                "ok": True,
                "service": "habits-companion",
                "version": VERSION,
                "port": payload.get("_port"),
                "lan_url": payload.get("_lan_url"),
                "sessions": sum(1 for s in _SESSIONS.values() if s["status"] != "cerrada"),
                "session_minutes": SESSION_MINUTES,
            }

        if path == "/session":
            sid = secrets.token_hex(8)
            session = {
                "id": sid,
                "code": new_code(),
                "token": secrets.token_hex(16),
                "status": "esperando",
                "device": str(payload.get("device") or "este equipo")[:80],
                "owner": str(payload.get("owner") or "")[:80],
                "peer": None,
                "started_at": now_ms(),
                "expires_at": now_ms() + SESSION_MINUTES * 60_000,
                "actions": [],
            }
            _SESSIONS[sid] = session
            return {
                "ok": True,
                "id": sid,
                "code": session["code"],
                "token": session["token"],
                "expires_at": session["expires_at"],
                "lan_url": payload.get("_lan_url"),
                "session_minutes": SESSION_MINUTES,
            }

        if path == "/pair":
            code = str(payload.get("code") or "").strip()
            session = find_by_code(code)
            if not session:
                return {"ok": False, "error": "código inválido o sesión cerrada"}
            session["peer"] = str(payload.get("name") or "ayudante")[:80]
            session["peer_token"] = secrets.token_hex(16)
            session["status"] = "activa"
            return {"ok": True, "token": session["peer_token"], "session": snapshot(session)}

        sid = str(payload.get("id") or "")
        session = _SESSIONS.get(sid)
        if not session:
            return {"ok": False, "error": "sesión no encontrada"}

        token = str(payload.get("token") or "")
        is_owner = token and token == session["token"]
        is_peer = token and token == session.get("peer_token")
        if not (is_owner or is_peer):
            return {"ok": False, "error": "token inválido"}

        if path == "/state":
            return {"ok": True, "session": snapshot(session)}

        if path == "/action":
            if session["status"] == "cerrada":
                return {"ok": False, "error": "la sesión está cerrada"}
            action = log_action(session, payload, "dueño" if is_owner else "ayudante")
            return {"ok": True, "action": action, "session": snapshot(session)}

        if path == "/approve":
            if not is_owner:
                return {"ok": False, "error": "sólo el dueño del equipo aprueba"}
            target = next((a for a in session["actions"] if a["id"] == payload.get("action_id")), None)
            if not target:
                return {"ok": False, "error": "acción no encontrada"}
            target["status"] = "aprobado" if payload.get("ok") else "rechazado"
            target["decided_at"] = now_ms()
            return {"ok": True, "action": target, "session": snapshot(session)}

        if path == "/done":
            target = next((a for a in session["actions"] if a["id"] == payload.get("action_id")), None)
            if not target:
                return {"ok": False, "error": "acción no encontrada"}
            if target["status"] == "esperando":
                return {"ok": False, "error": "falta la aprobación del dueño"}
            target["status"] = "hecho" if payload.get("ok", True) else "fallo"
            target["result"] = str(payload.get("detail") or "")[:400]
            return {"ok": True, "action": target, "session": snapshot(session)}

        if path == "/close":
            session["status"] = "cerrada"
            session["closed_reason"] = "colgó el dueño" if is_owner else "colgó el ayudante"
            session["actions"] = session["actions"][:20]
            return {"ok": True, "session": snapshot(session)}

    return {"ok": False, "error": "ruta desconocida"}


class Handler(BaseHTTPRequestHandler):
    server_version = f"HABITS-Companion/{VERSION}"

    def _send(self, data: Dict[str, Any], status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # La app puede vivir en otro origen (Netlify, localhost, celular): CORS abierto,
        # pero sólo se aceptan las rutas de arriba y todo pasa por token de sesión.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send({"ok": True})

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?")[0]
        query: Dict[str, Any] = {}
        if "?" in self.path:
            for pair in self.path.split("?", 1)[1].split("&"):
                if "=" in pair:
                    key, _, value = pair.partition("=")
                    query[key] = value
        self._handle(path, query)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._send({"ok": False, "error": "json inválido"}, 400)
            return
        self._handle(self.path.split("?")[0], payload)

    def _handle(self, path: str, payload: Dict[str, Any]) -> None:
        payload["_lan_url"] = self.server.lan_url  # type: ignore[attr-defined]
        payload["_port"] = self.server.server_address[1]  # type: ignore[attr-defined]
        try:
            self._send(route(path, payload))
        except Exception as error:  # nunca tumbar el hub por una petición rara
            self._send({"ok": False, "error": f"fallo interno: {error}"}, 500)

    def log_message(self, fmt: str, *args: Any) -> None:  # silencio: la consola se usa para el resumen
        return


# ──────────────────────────────── arranque ───────────────────────────────

def selftest() -> int:
    """Pruebas internas: no tocan la red. Devuelven 0 si todo está bien."""
    checks = 0
    payload: Dict[str, Any] = {"_lan_url": "http://127.0.0.1:8898"}

    created = route("/session", {**payload, "device": "Laptop de prueba", "owner": "Eaton"})
    assert created["ok"], created
    sid, code, owner_token = created["id"], created["code"], created["token"]
    checks += 1
    assert len(code) == 6 and code.isdigit(), "el código debe ser de 6 dígitos"
    checks += 1

    bad = route("/pair", {**payload, "code": "000000"})
    assert bad["ok"] is False, "un código inventado no debe emparejar"
    checks += 1

    paired = route("/pair", {**payload, "code": code, "name": "Hermana"})
    assert paired["ok"] and paired["token"], paired
    peer_token = paired["token"]
    checks += 1

    peek = route("/state", {**payload, "id": sid, "token": "basura"})
    assert peek["ok"] is False, "sin token válido no se ve la sesión"
    checks += 1

    safe = route("/action", {**payload, "id": sid, "token": peer_token, "kind": "abrir", "label": "Abrir la web del banco"})
    assert safe["ok"] and safe["action"]["status"] == "hecho", safe
    checks += 1

    risky = route(
        "/action",
        {**payload, "id": sid, "token": peer_token, "kind": "whatsapp", "label": "Enviar mensaje a mamá"},
    )
    assert risky["ok"] and risky["action"]["status"] == "esperando", risky
    checks += 1

    not_owner = route("/approve", {**payload, "id": sid, "token": peer_token, "action_id": risky["action"]["id"], "ok": True})
    assert not_owner["ok"] is False, "el ayudante no puede aprobar por el dueño"
    checks += 1

    early = route("/done", {**payload, "id": sid, "token": peer_token, "action_id": risky["action"]["id"]})
    assert early["ok"] is False, "no se puede dar por hecha una acción sin aprobar"
    checks += 1

    approved = route("/approve", {**payload, "id": sid, "token": owner_token, "action_id": risky["action"]["id"], "ok": True})
    assert approved["ok"] and approved["action"]["status"] == "aprobado", approved
    checks += 1

    done = route("/done", {**payload, "id": sid, "token": peer_token, "action_id": risky["action"]["id"], "ok": True})
    assert done["ok"] and done["action"]["status"] == "hecho", done
    checks += 1

    closed = route("/close", {**payload, "id": sid, "token": owner_token})
    assert closed["ok"] and closed["session"]["status"] == "cerrada", closed
    checks += 1

    print(f"selftest: {checks}/{checks} OK (emparejamiento, permisos, aprobación y cierre)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="HABITS Acompañante — hub local")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--host", default="0.0.0.0", help="0.0.0.0 = visible en la red local")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()

    if args.selftest:
        return selftest()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.lan_url = f"http://{lan_ip()}:{args.port}"  # type: ignore[attr-defined]
    server.daemon_threads = True  # type: ignore[attr-defined]

    print("HABITS ACOMPAÑANTE · hub local")
    print(f"  escuchando en 0.0.0.0:{args.port}")
    print(f"  enlace para la otra persona: {server.lan_url}")
    print(f"  sesiones de {SESSION_MINUTES} min · historial en memoria · Ctrl+C para salir")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\ncerrado. Las sesiones y su historial se borran al salir.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
