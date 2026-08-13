#!/usr/bin/env python3
"""
Backup HABITS → Supabase → JSON local
Exporta todas las tablas a ~/.hermes/backups/habits_YYYYMMDD_HHMMSS/
"""
import json, os, urllib.request, datetime, sys

SUPABASE_URL = "https://rwyqefehgelmcrrbvbmu.supabase.co"
SERVICE_KEY = os.environ.get("HABITS_SERVICE_KEY", "")

# Si no hay key en env, intentar leerla de un archivo local seguro
if not SERVICE_KEY:
    keyfile = os.path.expanduser("~/.hermes/habits_service_key.txt")
    if os.path.exists(keyfile):
        SERVICE_KEY = open(keyfile).read().strip()

if not SERVICE_KEY:
    print("ERROR: service_role key no encontrada. Ponla en ~/.hermes/habits_service_key.txt")
    sys.exit(1)

TABLES = ["habits_data", "hermes_tasks", "access_grants", "subscriptions", "payment_events", "study_briefs"]

ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
outdir = os.path.expanduser(f"~/.hermes/backups/habits_{ts}")
os.makedirs(outdir, exist_ok=True)

for table in TABLES:
    try:
        req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}?select=*")
        req.add_header("apikey", SERVICE_KEY)
        req.add_header("Authorization", "Bearer " + SERVICE_KEY)
        rows = json.loads(urllib.request.urlopen(req, timeout=30).read())
        path = os.path.join(outdir, f"{table}.json")
        json.dump(rows, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"✅ {table}: {len(rows)} filas")
    except Exception as e:
        print(f"⚠️ {table}: {e}")

# Limpiar backups viejos (mantener últimos 14)
backup_root = os.path.expanduser("~/.hermes/backups")
dirs = sorted([d for d in os.listdir(backup_root) if d.startswith("habits_")], reverse=True)
for old in dirs[14:]:
    import shutil
    shutil.rmtree(os.path.join(backup_root, old), ignore_errors=True)
    print(f"🗑️ Eliminado backup viejo: {old}")

print(f"\n✅ Backup completo en {outdir}")
