#!/usr/bin/env python3
"""
HABITS ⇄ UTP+class · Sincronizador resiliente
=============================================
Endpoint real: api-pao.utpxpedition.com/course/student/calendar/activities
- Auto-renueva el access_token con el refresh_token (Keycloak).
- Consulta las actividades/tareas del periodo.
- Sincroniza a Supabase (hermes_tasks).
- Si el refresh falla (expira ~1 día), escribe un reporte para re-capturar.

Uso:
  python utp_sync.py                # sincronizar
  python utp_sync.py --status       # estado de tokens
"""

import json
import os
import sys
import time
import uuid
import base64
import urllib.request
import urllib.error
import urllib.parse

SUPABASE_URL = "https://rwyqefehgelmcrrbvbmu.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3eXFlZmVoZ2VsbWNycmJ2Ym11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDQ0NTAsImV4cCI6MjEwMTY4MDQ1MH0.WTPrkC9oMveMLxCCi2RvGFNRM8T7H4wi6Y3O5xMxSRY"

KEYCLOAK_TOKEN_URL = "https://sso.utp.edu.pe/auth/realms/Xpedition/protocol/openid-connect/token"
CLIENT_ID = "pao-web"
API_BASE = "https://api-pao.utpxpedition.com"

STATE_FILE = os.path.expanduser("~/.hermes/utp_state.json")


def load_state():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(s):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(s, f, indent=2)


def jwt_exp(tok):
    try:
        p = tok.split(".")[1]
        p += "=" * (4 - len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p)).get("exp", 0)
    except Exception:
        return 0


def refresh_access_token(refresh_token):
    body = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": CLIENT_ID,
        "refresh_token": refresh_token,
    }).encode()
    req = urllib.request.Request(KEYCLOAK_TOKEN_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        resp = urllib.request.urlopen(req, timeout=25)
        d = json.loads(resp.read())
        return d.get("access_token"), d.get("refresh_token")
    except urllib.error.HTTPError as e:
        print(f"  ✗ Refresh falló: HTTP {e.code}: {e.read().decode(errors='replace')[:150]}", file=sys.stderr)
        return None, None


def get_valid_token():
    s = load_state()
    at, rt = s.get("access_token"), s.get("refresh_token")
    if at and jwt_exp(at) > time.time() + 60:
        return at, rt
    if rt and jwt_exp(rt) > time.time():
        print("  🔄 Renovando access_token...")
        nat, nrt = refresh_access_token(rt)
        if nat:
            s["access_token"] = nat
            if nrt:
                s["refresh_token"] = nrt
            save_state(s)
            print("  ✅ Token renovado.")
            return nat, s.get("refresh_token")
    return None, rt


def fetch_activities(token):
    s = load_state()
    uid = s.get("user_id", "")
    tid = s.get("tenant_id", "")
    today = time.strftime("%Y-%m-%d")
    url = (API_BASE + "/course/student/calendar/activities"
           + f"?userId={uid}&dateToQuery={today}+00:00:00&intervalMode=period")
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/json")
    req.add_header("User-Id", uid)
    req.add_header("User-Role", "STUDENT")
    req.add_header("X-Tenant-Id", tid)
    req.add_header("Transaction-Id", str(uuid.uuid4()))
    req.add_header("Origin", "https://class.utp.edu.pe")
    try:
        resp = urllib.request.urlopen(req, timeout=25)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"__error__": f"HTTP {e.code}: {e.read().decode(errors='replace')[:200]}"}
    except urllib.error.URLError as e:
        return {"__error__": str(e.reason)}


def parse_tasks(data):
    """Extrae actividades HOMEWORK/FORUM con fecha límite futura."""
    out = []
    try:
        events = data.get("data", {}).get("current_interval", {}).get("events", [])
    except Exception:
        return out
    seen = set()
    for ev in events:
        m = ev.get("metadata", {})
        title = ev.get("title", "")
        course = m.get("courseName", "")
        finish = ev.get("finishAt", "")
        status = m.get("studentStatus", "")
        atype = m.get("activityType", "")
        if not title or not finish:
            continue
        if atype not in ("HOMEWORK", "FORUM", "EVALUATION"):
            continue
        if status == "MISSING":
            continue  # ya venció
        key = (title, course, finish[:10])
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "title": title,
            "course": course,
            "due": finish,
            "type": atype,
            "status": status,
        })
    return out


def supabase_get(path):
    req = urllib.request.Request(SUPABASE_URL + path)
    req.add_header("apikey", SUPABASE_KEY)
    req.add_header("Authorization", "Bearer " + SUPABASE_KEY)
    return json.loads(urllib.request.urlopen(req, timeout=20).read())


def supabase_post(path, body):
    req = urllib.request.Request(SUPABASE_URL + path, method="POST")
    req.add_header("apikey", SUPABASE_KEY)
    req.add_header("Authorization", "Bearer " + SUPABASE_KEY)
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=minimal")
    req.data = json.dumps(body).encode()
    return urllib.request.urlopen(req, timeout=20)


def task_exists(title, due_date):
    q = (SUPABASE_URL + "/rest/v1/hermes_tasks?title=eq."
         + urllib.parse.quote(title) + "&due_date=eq." + urllib.parse.quote(due_date))
    try:
        return len(supabase_get(q.replace(SUPABASE_URL, ""))) > 0
    except Exception:
        return False


def sync():
    token, _ = get_valid_token()
    if not token:
        print("⚠️  Sin token válido. Re-captura la sesión (login en UTP+class).", file=sys.stderr)
        sys.exit(1)

    data = fetch_activities(token)
    if isinstance(data, dict) and "__error__" in data:
        print("✗ Error API:", data["__error__"], file=sys.stderr)
        sys.exit(2)

    tasks = parse_tasks(data)
    print(f"📚 {len(tasks)} actividades futuras encontradas.")

    new = skip = 0
    for t in tasks:
        due_date = t["due"][:10]
        due_time = t["due"][11:16] if len(t["due"]) >= 16 else "23:59"
        if task_exists(t["title"], due_date):
            skip += 1
            continue
        body = {
            "title": t["title"],
            "description": f"Importado de UTP+class ({t['type']})",
            "course": t["course"],
            "due_date": due_date,
            "due_time": due_time,
            "priority": "alta",
            "status": "pending",
            "source": "utp-sync",
        }
        supabase_post("/rest/v1/hermes_tasks", body)
        new += 1
        print(f"  ✅ {t['title']} | {t['course']} | {due_date} {due_time}")

    print(f"\n✅ Sincronización: {new} nuevas, {skip} ya existían.")


if __name__ == "__main__":
    if "--status" in sys.argv:
        s = load_state()
        at = s.get("access_token")
        rt = s.get("refresh_token")
        print("access_token:", "válido" if at and jwt_exp(at) > time.time() else "expirado/ausente")
        print("refresh_token:", "válido" if rt and jwt_exp(rt) > time.time() else "expirado/ausente")
        print("user_id:", s.get("user_id", "?"))
        sys.exit(0)
    sync()
