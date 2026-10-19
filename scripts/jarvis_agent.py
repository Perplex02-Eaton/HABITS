#!/usr/bin/env python3
"""
JARVIS AGENT — servidor local de acciones para la app HABITS.

Da "manos" a Jarvis: abrir URLs en el navegador real, abrir apps nativas de
Windows, controlar multimedia (play/pausa/siguiente/volumen), capturas de
pantalla, traer ventanas al frente, bloquear la PC y registrar las llamadas
de UTP+class para descubrir el endpoint real de subida de tareas.

Escucha SOLO en 127.0.0.1:8877 (nada expuesto a la red). Chrome permite que una
página https haga fetch a http://127.0.0.1 (origen potencialmente confiable),
por eso la app en Netlify puede hablarle directamente.

Uso:
    python scripts/jarvis_agent.py            # 127.0.0.1:8877
    python scripts/jarvis_agent.py --port 8877 --verbose
    python scripts/jarvis_agent.py --once     # corre una accion y sale (pruebas)

Endpoints (todos GET salvo /record):
    /health                          estado + capacidades
    /open?url=…[&dry=1]              abre una URL http(s) en el navegador por defecto
    /app?name=youtube[&dry=1]        abre app nativa / carpeta / servicio conocido
    /media?action=play_pause|next|prev|stop|vol_up|vol_down|mute
    /screenshot                      guarda PNG y devuelve la ruta
    /focus?title=spotify             trae al frente la ventana que coincida
    /lock                            bloquea la sesión de Windows
    /record  (POST JSON)             registra una llamada de UTP (para descubrir el endpoint de subida)
    /records?limit=20                últimas llamadas registradas (cabeceras sensibles redactadas)
    /utp-refresh                     relee UTP+class: regenera la memoria de clases del sílabo capturado

Seguridad: no ejecuta comandos arbitrarios, no acepta esquemas que no sean
http/https y sólo abre rutas dentro de carpetas personales conocidas.
"""

from __future__ import annotations

import argparse
import ctypes
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
DEFAULT_PORT = 8877
VERSION = "1.0.0"
AGENT_NAME = "jarvis-agent"
HOME = Path(os.path.expanduser("~"))
STATE_DIR = HOME / ".hermes"
LOG_PATH = STATE_DIR / "jarvis_agent.log"
RECORD_PATH = STATE_DIR / "utp_recorded.jsonl"
SHOT_DIR = HOME / "Pictures" / "JarvisCapturas"
HERE = Path(__file__).resolve().parent
SHOT_PS1 = HERE / "jarvis-screenshot.ps1"
UTP_SCRIPT = HERE / "utp_courses.py"          # memoria de clases (sílabo -> semanas)
COURSES_JSON = STATE_DIR / "utp_courses.json"  # memoria generada
SYNC_SCRIPT = HERE / "utp_sync.py"             # tareas EN VIVO desde la API PAO (UTP+class)
CAPTURE_SCRIPT = HERE / "utp_capture_server.py"  # receptor de la sesión (localhost:8899)
INSTALL_PAGE = HERE / "install-bookmarklet.html"  # página para arrastrar el botón
TASKS_JSON = HERE.parent / "public" / "utp-tasks.json"
CLASS_URL = "https://class.utp.edu.pe"
CAPTURE_PORT = 8899

# --- motor de lenguaje LOCAL (Ollama): respuestas sin gastar créditos de API ---
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("JARVIS_MODEL", "qwen3:8b")
OLLAMA_KEEP_ALIVE = os.environ.get("JARVIS_KEEP_ALIVE", "15m")  # mantiene el modelo en VRAM
ASK_TIMEOUT = int(os.environ.get("JARVIS_ASK_TIMEOUT", "240"))

JARVIS_SYSTEM = (
    "Eres JARVIS, el mayordomo tecnologico personal del jefe. Sereno, leal, elegante y "
    "preciso. Responde SIEMPRE en espanol latinoamericano natural (Peru), tratandolo de "
    "'jefe' como maximo una vez por respuesta. Se breve: una a tres frases, porque tu "
    "respuesta se lee en voz alta. Si te piden el resumen de la semana o de un curso, hasta "
    "seis frases. Usa la MEMORIA que te doy como unica fuente para sus cursos, temas, "
    "semanas y entregas; si algo no esta ahi, di que no lo tienes cargado y no lo inventes. "
    "Nunca afirmes que ejecutaste una accion si la aplicacion no lo confirmo. "
    "Prohibido usar markdown, listas con guiones, negritas o emojis: texto plano para voz."
)

# Orígenes que pueden hablarle al agente desde el navegador.
ALLOWED_ORIGINS = (
    "http://localhost",
    "http://127.0.0.1",
    "https://habitset.netlify.app",
)

DANGEROUS_HEADERS = ("authorization", "cookie", "x-csrf-token", "set-cookie")

# --- acciones multimedia (virtual keys de Windows) ---
MEDIA_KEYS = {
    "play_pause": 0xB3,
    "next": 0xB0,
    "prev": 0xB1,
    "stop": 0xB2,
    "vol_up": 0xAF,
    "vol_down": 0xAE,
    "mute": 0xAD,
}

# --- apps nativas / carpetas / servicios por nombre hablado ---
WEB_TARGETS = {
    "youtube": "https://www.youtube.com/",
    "netflix": "https://www.netflix.com/browse",
    "twitch": "https://www.twitch.tv/",
    "prime": "https://www.primevideo.com/",
    "disney": "https://www.disneyplus.com/",
    "hbo": "https://www.max.com/",
    "spotify_web": "https://open.spotify.com/",
    "drive": "https://drive.google.com/drive/my-drive",
    "docs": "https://docs.google.com/document/u/0/",
    "sheets": "https://docs.google.com/spreadsheets/u/0/",
    "slides": "https://docs.google.com/presentation/u/0/",
    "classroom": "https://classroom.google.com/",
    "gmail": "https://mail.google.com/",
    "correo": "https://mail.google.com/",
    "calendar": "https://calendar.google.com/",
    "chatgpt": "https://chatgpt.com/",
    "claude": "https://claude.ai/",
    "gemini": "https://gemini.google.com/",
    "github": "https://github.com/",
    "notion": "https://www.notion.so/",
    "trello": "https://trello.com/",
    "whatsapp": "https://web.whatsapp.com/",
    "instagram": "https://www.instagram.com/",
    "tiktok": "https://www.tiktok.com/",
    "twitter": "https://x.com/",
    "reddit": "https://www.reddit.com/",
    "linkedin": "https://www.linkedin.com/feed/",
    "mercado_libre": "https://www.mercadolibre.com.pe/",
    "maps": "https://www.google.com/maps",
    "traductor": "https://translate.google.com/?sl=auto&tl=es",
    "perplexity": "https://www.perplexity.ai/",
    "utp": "https://class.utp.edu.pe/",
    "utp_aula": "https://class.utp.edu.pe/",
    "paideia": "https://paideia.utp.edu.pe/",
    "netlify": "https://app.netlify.com/",
    "supabase": "https://supabase.com/dashboard",
    "cloudflare": "https://dash.cloudflare.com/",
}

NATIVE_TARGETS = {
    "spotify": "spotify:",
    "steam": "steam://open/games",
    "discord": "discord:",
    "telegram": "tg:",
    "vscode": "code",
    "code": "code",
    "calculadora": "calc",
    "calc": "calc",
    "bloc de notas": "notepad",
    "notepad": "notepad",
    "paint": "mspaint",
    "explorador": "explorer",
    "explorer": "explorer",
    "administrador de tareas": "taskmgr",
    "panel de control": "control",
    "configuracion": "ms-settings:",
    "word": "winword",
    "excel": "excel",
    "powerpoint": "powerpnt",
    "terminal": "wt",
    "consola": "wt",
    "whatsapp_desktop": "whatsapp:",
}

FOLDER_TARGETS = {
    "habits": Path("C:/EATON/HABITS"),
    "proyecto habits": Path("C:/EATON/HABITS"),
    "habits app": Path("C:/EATON/HABITS"),
    "nexo": Path("C:/EATON/PUBLICACIONES"),
    "publicaciones": Path("C:/EATON/PUBLICACIONES"),
    "descargas": HOME / "Downloads",
    "downloads": HOME / "Downloads",
    "documentos": HOME / "Documents",
    "escritorio": HOME / "Desktop",
    "imagenes": HOME / "Pictures",
    "musica": HOME / "Music",
    "videos": HOME / "Videos",
    "capturas": SHOT_DIR,
    "capturas de jarvis": SHOT_DIR,
    "vintaghe": Path("C:/EATON/VINTAGHE"),
    "eaton": Path("C:/EATON"),
    "command center": Path("C:/EATON/eaton_command_center"),
}


# --------------------------------------------------------------------------- #
# utilidades
# --------------------------------------------------------------------------- #
def log(msg: str) -> None:
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  {msg}"
    print(line, flush=True)
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
        if LOG_PATH.stat().st_size > 512_000:
            lines = LOG_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()[-800:]
            LOG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except Exception:
        pass


def run_powershell(script: str, timeout: int = 25) -> tuple[int, str]:
    """Ejecuta un script PowerShell sin perfil. Devuelve (exit_code, salida)."""
    ps = ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]
    try:
        proc = subprocess.run(ps, capture_output=True, text=True, timeout=timeout,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return proc.returncode, (proc.stdout or proc.stderr or "").strip()
    except subprocess.TimeoutExpired:
        return 1, "timeout"
    except FileNotFoundError:
        return 1, "powershell no disponible"


def startfile(target: str) -> tuple[bool, str]:
    try:
        os.startfile(target)  # type: ignore[attr-defined]
        return True, "ok"
    except FileNotFoundError:
        return False, "no encontrado"
    except OSError as exc:
        first_line = str(exc).splitlines()[0]
        return False, first_line


def norm(value: str) -> str:
    s = (value or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n")):
        s = s.replace(a, b)
    return s


_FILLER_RE = re.compile(
    r"\b(por favor|de|del|la|el|los|las|mi|mis|un|una|unos|unas|app|aplicacion|aplicación|programa|"
    r"carpeta|archivo|abre|abrir|abreme|ábreme|ejecuta|lanza|inicia|entra a|ve a|pon|ponme|muestrame)\b"
)


def clean_name(value: str) -> str:
    """Normaliza un nombre hablado quitando muletillas: 'la app de Spotify' -> 'spotify'."""
    s = norm(value).replace("_", " ")
    s = _FILLER_RE.sub(" ", s)
    return " ".join(s.split())


def _index_tables() -> dict[str, tuple[str, str]]:
    index: dict[str, tuple[str, str]] = {}
    for label, url in WEB_TARGETS.items():
        index.setdefault(clean_name(label), ("web", url))
    for label, target in NATIVE_TARGETS.items():
        index.setdefault(clean_name(label), ("app", target))
    for label, target in FOLDER_TARGETS.items():
        index.setdefault(clean_name(label), ("folder", str(target)))
    return index


TARGET_INDEX = _index_tables()


def resolve_app(name: str) -> tuple[str, str] | tuple[None, None]:
    """Devuelve (tipo, destino) para un nombre hablado, o (None, None)."""
    key = clean_name(name)
    if not key:
        return None, None
    raw = norm(name)
    if raw.startswith(("http://", "https://")):
        return "web", raw
    if key in TARGET_INDEX:
        return TARGET_INDEX[key]
    # coincidencia parcial: "el bloc" -> "bloc de notas", "mis descargas" -> "descargas"
    words = key.split()
    if len(key) >= 3:
        for label, entry in TARGET_INDEX.items():
            if key in label or label in key:
                return entry
    for word in sorted(words, key=len, reverse=True):
        if len(word) < 3:
            continue
        for label, entry in TARGET_INDEX.items():
            if word in label.split():
                return entry
    for word in words:
        if word in WEB_TARGETS:
            return "web", WEB_TARGETS[word]
    return None, None



def press_media_key(action: str) -> tuple[bool, str]:
    vk = MEDIA_KEYS.get(norm(action))
    if not vk:
        return False, f"accion desconocida: {action}"
    try:
        user32 = ctypes.windll.user32
        ext = 0x0001
        user32.keybd_event(vk, 0, ext, 0)
        user32.keybd_event(vk, 0, ext | 0x0002, 0)
        return True, "ok"
    except Exception as exc:
        return False, str(exc)


def take_screenshot() -> tuple[bool, str]:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    out = SHOT_DIR / f"jarvis-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
    if not SHOT_PS1.exists():
        return False, "falta scripts/jarvis-screenshot.ps1"
    code, msg = run_powershell(
        f'& "{SHOT_PS1}" -Path "{out}"', timeout=30
    )
    if code == 0 and out.exists():
        return True, str(out)
    return False, msg or "no se pudo capturar"


def focus_window(title: str) -> tuple[bool, str]:
    safe = title.replace("'", "''")
    code, out = run_powershell(
        f"$s=New-Object -ComObject WScript.Shell;"
        f"if($s.AppActivate('{safe}')){{'ok'}}else{{'no-encontrada'}}"
    )
    if code == 0 and out.strip() == "ok":
        return True, "ok"
    return False, "no encontré esa ventana abierta"


def lock_pc() -> tuple[bool, str]:
    try:
        ctypes.windll.user32.LockWorkStation()
        return True, "ok"
    except Exception as exc:
        return False, str(exc)


def send_keys(text: str) -> tuple[bool, str]:
    """Escribe texto en la ventana activa (SendKeys con escapes)."""
    if not text:
        return False, "texto vacío"
    escaped = (
        text.replace("~", "{~}")
        .replace("%", "{%}")
        .replace("^", "{^}")
        .replace("+", "{+}")
        .replace("(", "{(}")
        .replace(")", "{)}")
        .replace("[", "{[}")
        .replace("]", "{]}")
        .replace("{", "{{}")
        .replace("}", "{}}")
    )
    if len(escaped) > 1200:
        return False, "texto demasiado largo"
    script = (
        "$s=New-Object -ComObject WScript.Shell;"
        f"$s.SendKeys('{escaped}');'ok'"
    )
    code, out = run_powershell(script)
    if code == 0:
        return True, "ok"
    return False, out or "no se pudo escribir"


def set_clipboard(text: str) -> tuple[bool, str]:
    """Copia texto al portapapeles de Windows (para pegar la tarea lista)."""
    if not text:
        return False, "texto vacío"
    if len(text) > 100_000:
        return False, "texto demasiado largo"
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = STATE_DIR / "clipboard.tmp"
        tmp.write_text(text, encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:120]
    script = f"Get-Content -Raw -Encoding UTF8 '{tmp}' | Set-Clipboard;'ok'"
    code, out = run_powershell(script)
    if code == 0:
        return True, "ok"
    return False, out or "no se pudo copiar"



def redact(payload: dict) -> dict:
    out = {}
    for key, value in payload.items():
        if str(key).lower() in DANGEROUS_HEADERS:
            out[key] = "[REDACTED]"
        elif isinstance(value, dict):
            out[key] = redact(value)
        elif isinstance(value, str) and len(value) > 4000:
            out[key] = value[:4000] + "…[truncado]"
        else:
            out[key] = value
    return out


def save_record(entry: dict) -> int:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    entry = redact(entry)
    entry.setdefault("at", datetime.now().isoformat(timespec="seconds"))
    with open(RECORD_PATH, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    total = sum(1 for _ in open(RECORD_PATH, encoding="utf-8"))
    return total


def read_records(limit: int = 20) -> list[dict]:
    if not RECORD_PATH.exists():
        return []
    lines = RECORD_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()[-limit:]
    out = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
class AgentHandler(BaseHTTPRequestHandler):
    server_version = f"{AGENT_NAME}/{VERSION}"
    protocol_version = "HTTP/1.1"

    # -- infraestructura ---------------------------------------------------- #
    def log_message(self, fmt, *args):  # noqa: D102
        if self.server.verbose:  # type: ignore[attr-defined]
            log("http " + fmt % args)

    def _origin(self) -> str | None:
        origin = self.headers.get("Origin")
        if not origin:
            return None
        # "null" (iframes sandbox / file://) NO se autoriza: cualquier web podría
        # embeber uno y manejar el agente. Sólo la app o el dev server.
        if origin == "null":
            return ""
        if any(origin.startswith(prefix) for prefix in ALLOWED_ORIGINS):
            return origin
        return ""

    def _cors(self) -> dict[str, str]:
        origin = self._origin()
        headers = {
            "Cache-Control": "no-store",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            # Chrome exige esto para permitir que una página pública hable con localhost.
            "Access-Control-Allow-Private-Network": "true",
        }
        if origin:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Vary"] = "Origin"
        return headers

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for key, value in self._cors().items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _blocked(self) -> bool:
        """Rechaza orígenes no autorizados (evita que webs de terceros usen el agente)."""
        if self._origin() == "":
            self._json(403, {"ok": False, "error": "origen no autorizado"})
            return True
        return False

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        for key, value in self._cors().items():
            self.send_header(key, value)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"
        q = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        dry = q.get("dry") in ("1", "true", "si", "sí")
        handler = {
            "/health": self.route_health,
            "/open": self.route_open,
            "/app": self.route_app,
            "/media": self.route_media,
            "/screenshot": self.route_screenshot,
            "/focus": self.route_focus,
            "/type": self.route_type,
            "/clipboard": self.route_clipboard,
            "/lock": self.route_lock,
            "/records": self.route_records,
            "/utp-refresh": self.route_utp_refresh,
            "/utp-connect": self.route_utp_connect,
            "/llm-status": self.route_llm_status,
        }.get(route)
        if not handler:
            self._json(404, {"ok": False, "error": f"ruta desconocida: {route}"})
            return
        if self._blocked():
            return
        try:
            handler(q, dry)
        except Exception as exc:  # nunca tumbar el servidor por una acción
            log(f"ERROR {route}: {exc!r}")
            self._json(500, {"ok": False, "error": str(exc)})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path.rstrip("/")
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if self._blocked():
            return
        if route == "/ask":
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except Exception:
                self._json(400, {"ok": False, "error": "json inválido"})
                return
            try:
                self.route_ask(payload)
            except Exception as exc:
                log(f"ERROR /ask: {exc!r}")
                self._json(500, {"ok": False, "error": str(exc)})
            return
        if route == "/record":
            try:
                entry = json.loads(raw.decode("utf-8") or "{}")
            except Exception:
                self._json(400, {"ok": False, "error": "json inválido"})
                return
            total = save_record(entry)
            log(f"record #{total}: {entry.get('method')} {str(entry.get('url'))[:120]}")
            self._json(200, {"ok": True, "total": total})
            return
        self._json(404, {"ok": False, "error": f"ruta desconocida: {route}"})

    # -- motor local (Ollama) ----------------------------------------------- #

    def route_llm_status(self, q, dry) -> None:
        """¿Está listo el motor local? No gasta nada: sólo pregunta a Ollama."""
        import urllib.request

        info = {"ok": False, "ollama": OLLAMA_URL, "model": OLLAMA_MODEL, "models": [], "ready": False}
        try:
            with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=4) as res:
                data = json.loads(res.read().decode("utf-8") or "{}")
            names = [str(m.get("name", "")) for m in data.get("models", [])]
            info["models"] = names
            info["ready"] = any(n == OLLAMA_MODEL or n.startswith(OLLAMA_MODEL.split(":")[0]) for n in names)
            info["ok"] = bool(names)
        except Exception as exc:
            info["error"] = f"Ollama no responde en {OLLAMA_URL} ({exc.__class__.__name__})"
        self._json(200, info)

    def route_ask(self, body: dict) -> None:
        """POST /ask {text, context?, history?} -> respuesta del modelo LOCAL (gratis)."""
        import urllib.request

        text = str(body.get("text") or "").strip()
        if not text:
            self._json(400, {"ok": False, "error": "falta text"})
            return
        context = str(body.get("context") or "").strip()
        model = str(body.get("model") or OLLAMA_MODEL).strip()
        system = str(body.get("system") or JARVIS_SYSTEM)
        if context:
            system += f"\n\nMEMORIA del jefe (sílabo y notas de clase UTP+class; única fuente):\n{context}"
        messages = [{"role": "system", "content": system}]
        for turn in body.get("history") or []:
            if not isinstance(turn, dict):
                continue
            role = "assistant" if str(turn.get("role")) == "assistant" else "user"
            content = str(turn.get("text") or "").strip()
            if content:
                messages.append({"role": role, "content": content[:800]})
        messages.append({"role": "user", "content": text[:4000]})

        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "keep_alive": OLLAMA_KEEP_ALIVE,
            "options": {"temperature": 0.4, "num_ctx": int(body.get("num_ctx") or 8192)},
        }
        started = time.time()
        try:
            req = urllib.request.Request(
                f"{OLLAMA_URL}/api/chat",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=ASK_TIMEOUT) as res:
                data = json.loads(res.read().decode("utf-8") or "{}")
        except Exception as exc:
            log(f"ask: motor local falló ({exc!r})")
            self._json(503, {
                "ok": False,
                "error": f"motor local no disponible: {exc.__class__.__name__}",
                "hint": "Levanta Ollama (ollama serve) o cambia de modelo en Ajustes.",
                "model": model,
            })
            return
        answer = str((data.get("message") or {}).get("content") or "").strip()
        if not answer:
            self._json(502, {"ok": False, "error": "respuesta vacía del motor local", "model": model})
            return
        log(f"ask: {len(answer)} chars en {time.time() - started:.1f}s ({model})")
        self._json(200, {
            "ok": True,
            "text": answer,
            "model": data.get("model", model),
            "provider": "ollama",
            "seconds": round(time.time() - started, 1),
        })

    # -- rutas -------------------------------------------------------------- #
    def route_health(self, q, dry) -> None:
        self._json(200, {
            "ok": True,
            "agent": AGENT_NAME,
            "version": VERSION,
            "host": self.headers.get("Host"),
            "pid": os.getpid(),
            "time": datetime.now().isoformat(timespec="seconds"),
            "capabilities": [
                "ask_local", "llm_status", "open_url", "open_app", "open_folder", "media_keys",
                "screenshot", "focus_window", "type_text", "clipboard",
                "lock", "utp_record", "utp_refresh", "utp_connect",
            ],
            "apps": sorted(set(WEB_TARGETS) | set(NATIVE_TARGETS)),
            "folders": sorted(FOLDER_TARGETS),
            "actions": {
                "abrir": ["spotify", "vscode", "youtube", "gmail", "whatsapp", "class.utp.edu.pe", "carpeta de habits"],
                "multimedia": ["pausa", "siguiente", "anterior", "sube volumen", "silencio"],
                "pc": ["captura de pantalla", "trae spotify al frente", "escribe …", "copia …", "bloquea la PC"],
            },
        })

    def route_open(self, q, dry) -> None:
        url = (q.get("url") or "").strip()
        if not re.match(r"^https?://", url, re.I):
            self._json(400, {"ok": False, "error": "sólo http/https"})
            return
        if dry:
            self._json(200, {"ok": True, "dry": True, "target": url, "kind": "web"})
            return
        ok, msg = startfile(url)
        log(f"open url={url[:100]} ok={ok}")
        self._json(200 if ok else 500, {"ok": ok, "target": url, "kind": "web", "error": None if ok else msg})

    def route_app(self, q, dry) -> None:
        name = (q.get("name") or q.get("target") or "").strip()
        if not name:
            self._json(400, {"ok": False, "error": "falta name"})
            return
        kind, target = resolve_app(name)
        if not kind:
            self._json(404, {
                "ok": False, "error": f"no conozco '{name}'",
                "known": sorted(WEB_TARGETS)[:40],
            })
            return
        if dry:
            self._json(200, {"ok": True, "dry": True, "kind": kind, "target": target})
            return
        ok, msg = startfile(target)
        log(f"app name={name!r} kind={kind} -> {target[:80]} ok={ok}")
        self._json(200 if ok else 500, {"ok": ok, "kind": kind, "target": target, "error": None if ok else msg})

    def route_media(self, q, dry) -> None:
        action = q.get("action") or ""
        ok, msg = press_media_key(action)
        log(f"media {action} ok={ok}")
        self._json(200 if ok else 400, {"ok": ok, "action": norm(action), "error": None if ok else msg})

    def route_screenshot(self, q, dry) -> None:
        ok, result = take_screenshot()
        log(f"screenshot ok={ok}")
        payload = {"ok": ok, "path": result if ok else None, "error": None if ok else result}
        if ok and q.get("inline") in ("1", "true"):
            try:
                import base64
                payload["data_url"] = "data:image/png;base64," + base64.b64encode(Path(result).read_bytes()).decode()
            except Exception:
                pass
        self._json(200 if ok else 500, payload)

    def route_focus(self, q, dry) -> None:
        title = (q.get("title") or "").strip()
        if not title:
            self._json(400, {"ok": False, "error": "falta title"})
            return
        ok, msg = focus_window(title)
        log(f"focus {title!r} ok={ok}")
        self._json(200 if ok else 404, {"ok": ok, "title": title, "error": None if ok else msg})

    def route_lock(self, q, dry) -> None:
        if dry:
            self._json(200, {"ok": True, "dry": True, "target": "lock"})
            return
        try:
            delay = float(q.get("delay") or 0)
        except ValueError:
            delay = 0
        if delay > 0:
            # Deja que Jarvis termine de hablar antes de bloquear.
            time.sleep(min(delay, 30))
        ok, msg = lock_pc()
        log(f"lock ok={ok} delay={delay}")
        self._json(200 if ok else 500, {"ok": ok, "error": None if ok else msg})

    def route_type(self, q, dry) -> None:
        text = q.get("text") or ""
        if not text:
            self._json(400, {"ok": False, "error": "falta text"})
            return
        if dry:
            self._json(200, {"ok": True, "dry": True, "target": text[:60]})
            return
        ok, msg = send_keys(text)
        log(f"type {len(text)} chars ok={ok}")
        self._json(200 if ok else 500, {"ok": ok, "chars": len(text), "error": None if ok else msg})

    def route_clipboard(self, q, dry) -> None:
        text = q.get("text") or ""
        if not text:
            self._json(400, {"ok": False, "error": "falta text"})
            return
        if dry:
            self._json(200, {"ok": True, "dry": True, "chars": len(text)})
            return
        ok, msg = set_clipboard(text)
        log(f"clipboard {len(text)} chars ok={ok}")
        self._json(200 if ok else 500, {"ok": ok, "chars": len(text), "error": None if ok else msg})

    def route_records(self, q, dry) -> None:
        limit = int(q.get("limit") or 20)
        records = read_records(limit)
        self._json(200, {"ok": True, "count": len(records), "records": records})

    def route_utp_refresh(self, q, dry) -> None:
        """Relee UTP+class y regenera la memoria de clases que usa la app."""
        if dry:
            self._json(200, {"ok": True, "dry": True, "script": str(UTP_SCRIPT)})
            return
        res = regenerate_course_memory(live=q.get("live") != "0")
        log(f"utp-refresh ok={res['ok']} live={res['live']} code={res['code']}")
        payload = {
            "ok": res["ok"],
            "code": res["code"],
            "live": res["live"],
            "needs_connect": res["needs_connect"],
            "steps": res["steps"],
            "output": res["output"][-900:],
            "connect_port": CAPTURE_PORT,
        }
        if res["ok"]:
            try:
                with open(COURSES_JSON, encoding="utf-8") as f:
                    data = json.load(f)
                payload["current_week"] = data.get("current_week")
                payload["generated_at"] = data.get("generated_at")
                payload["courses"] = len(data.get("courses") or {})
            except Exception as exc:
                payload["warn"] = f"no pude leer la memoria: {exc!r}"
        if TASKS_JSON.exists():
            try:
                with open(TASKS_JSON, encoding="utf-8") as f:
                    tj = json.load(f)
                payload["utp_tasks"] = len(tj.get("tasks") or [])
            except Exception:
                pass
        self._json(200 if res["ok"] else 500, payload)

    def route_utp_connect(self, q, dry) -> None:
        """Un clic: levanta el receptor local y abre UTP+class + la página del botón.

        El bookmarklet (una sola vez en la barra de favoritos) manda la sesión
        al receptor y con eso Jarvis puede leer tareas EN VIVO de UTP+class.
        """
        port = int(q.get("port") or CAPTURE_PORT)
        if dry:
            self._json(200, {"ok": True, "dry": True, "port": port, "url": CLASS_URL})
            return
        steps: list[str] = []
        started = False
        if not port_open(port):
            started = start_capture_server(port)
            steps.append("receptor local arriba" if started else "no pude levantar el receptor")
        else:
            steps.append("receptor local ya estaba arriba")
        opened: list[str] = []
        if str(q.get("install", "1")) != "0" and INSTALL_PAGE.exists():
            ok, _ = startfile(INSTALL_PAGE.as_uri())
            if ok:
                opened.append("install")
        ok, _ = startfile(CLASS_URL)
        if ok:
            opened.append("class")
        log(f"utp-connect port={port} started={started} opened={opened}")
        self._json(200, {
            "ok": True,
            "port": port,
            "receiver": f"http://127.0.0.1:{port}/status",
            "url": CLASS_URL,
            "opened": opened,
            "started": started,
            "steps": steps + [
                "Haz clic en el botón 'Sincronizar con HABITS' dentro de UTP+class",
                "Vuelve aquí y pulsa Leer UTP+class",
            ],
        })


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def _run_script(script: Path, args: list[str] | None = None, timeout: int = 120) -> tuple[bool, str, int]:
    """Corre un script python del repo sin abrir ventana. Devuelve (ok, salida, código)."""
    if not script.exists():
        return False, f"no encuentro {script}", -1
    python = sys.executable or "python"
    try:
        proc = subprocess.run(
            [python, str(script)] + list(args or []),
            cwd=str(HERE.parent), capture_output=True, text=True, timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired:
        return False, f"timeout en {script.name}", -1
    except Exception as exc:
        return False, f"no pude ejecutar {script.name}: {exc!r}", -1
    out = ((proc.stdout or "") + (proc.stderr or "")).strip()
    return proc.returncode == 0, out, proc.returncode


def regenerate_course_memory(live: bool = True) -> dict:
    """Relee UTP+class y reconstruye la memoria de clases.

    Paso 1 (live): scripts/utp_sync.py consulta la API PAO con la sesión guardada
                   y actualiza public/utp-tasks.json (tareas reales).
    Paso 2:         scripts/utp_courses.py convierte el sílabo en la memoria
                   semana/sesión/tema que lee la app.
    Si la sesión venció, el paso 1 avisa y sólo se regenera el sílabo.
    """
    steps: list[str] = []
    live_ok = False
    needs_connect = False
    if live and SYNC_SCRIPT.exists():
        ok, out, _ = _run_script(SYNC_SCRIPT, timeout=90)
        live_ok = ok and "utp-tasks" in out.lower() and "Sin token" not in out
        if not live_ok:
            needs_connect = "Sin token" in out or "401" in out or "token" in out.lower()
        tail = out.strip().splitlines()[-1] if out.strip() else ""
        steps.append(f"tareas en vivo: {'sí' if live_ok else 'no'} — {tail[:160]}")
    else:
        steps.append("tareas en vivo: omitido")

    ok, out, code = _run_script(UTP_SCRIPT, timeout=180)
    steps.append(f"memoria de clases: {'ok' if ok else 'falló'} ({code})")
    return {
        "ok": ok,
        "code": code,
        "output": out,
        "live": live_ok,
        "needs_connect": bool(needs_connect and not live_ok),
        "steps": steps,
    }


def port_open(port: int) -> bool:
    """¿Hay algo escuchando ya en ese puerto local?"""
    import socket
    try:
        with socket.create_connection(("127.0.0.1", int(port)), 0.4):
            return True
    except OSError:
        return False


def start_capture_server(port: int) -> bool:
    """Levanta el receptor de la sesión UTP (localhost:PORT) y espera a que escuche."""
    if not CAPTURE_SCRIPT.exists():
        return False
    python = sys.executable or "python"
    try:
        subprocess.Popen(
            [python, str(CAPTURE_SCRIPT), "--port", str(int(port))],
            cwd=str(HERE.parent), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0),
        )
    except Exception as exc:
        log(f"capture server no arrancó: {exc!r}")
        return False
    for _ in range(15):
        time.sleep(0.2)
        if port_open(port):
            return True
    return False


def selftest() -> int:
    """Comprueba las rutas locales sin abrir nada en pantalla."""
    print("== selftest jarvis_agent ==")
    checks: list[tuple[str, bool, str]] = []
    down = press_media_key("mute"), press_media_key("mute")  # ida y vuelta: no cambia nada audible
    checks.append(("media mute/mute", all(r[0] for r in down), ""))
    ok, path = take_screenshot()
    checks.append(("screenshot", ok, path))
    kind, target = resolve_app("youtube")
    checks.append(("resolve youtube", kind == "web", f"{kind} {target}"))
    kind, target = resolve_app("carpeta de descargas")
    checks.append(("resolve descargas", kind == "folder", f"{kind} {target}"))
    kind, target = resolve_app("vintaghe")
    checks.append(("resolve vintaghe", kind == "folder", f"{kind} {target}"))
    kind, target = resolve_app("cosa rara inexistente")
    checks.append(("resolve desconocido", kind is None, "ok si no resuelve"))
    ok, msg = focus_window("ventana que no existe 12345")
    checks.append(("focus inexistente falla limpio", not ok, msg))
    for name, passed, detail in checks:
        print(f"{'PASS' if passed else 'FAIL'}  {name}  {detail}")
    return 0 if all(c[1] for c in checks) else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Agente local de JARVIS")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()

    if args.selftest:
        return selftest()

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), AgentHandler)
    server.daemon_threads = True
    server.verbose = args.verbose  # type: ignore[attr-defined]
    log(f"jarvis-agent v{VERSION} escuchando en http://{args.host}:{args.port} (pid {os.getpid()})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("detenido por el usuario")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
