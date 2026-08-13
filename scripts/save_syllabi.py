import json, os, urllib.request

SUPABASE_URL = "https://rwyqefehgelmcrrbvbmu.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3eXFlZmVoZ2VsbWNycmJ2Ym11Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjEwNDQ1MCwiZXhwIjoyMTAxNjgwNDUwfQ.AhERdh-CYpAEEHWl8LFTp3DJDcS8wNsGs-vnjqPFMxA"

syllabi = json.load(open(os.path.expanduser("~/.hermes/utp_syllabi_text.json"), encoding="utf-8"))

# Leer habits_data
req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/habits_data?select=*")
req.add_header("apikey", SERVICE_KEY)
req.add_header("Authorization", "Bearer " + SERVICE_KEY)
rows = json.loads(urllib.request.urlopen(req, timeout=20).read())

if not rows:
    print("No data in habits_data")
    exit(1)

row = rows[0]
data = row["data"]
user_id = row["user_id"]
courses = data.get("courses", [])

# Mapeo: primera palabra del nombre del curso -> syllabus
def keyword(name):
    return name.split(" ")[0].lower()

syllabi_by_keyword = {keyword(k): v for k, v in syllabi.items()}

updated = 0
for course in courses:
    kw = keyword(course["name"])
    # Match flexible
    match = None
    for skw, sdata in syllabi_by_keyword.items():
        if kw in skw or skw in kw:
            match = sdata
            break
    if match:
        course["syllabus"] = match["text"]
        course["syllabusName"] = f"Sílabo ({kw})"
        updated += 1
        print(f"  ✅ {course['name']} -> sílabo guardado ({len(match['text'])} chars)")

data["courses"] = courses

# Escribir de vuelta
body = json.dumps({"data": data, "updated_at": "2026-08-13T08:00:00Z"}).encode()
req2 = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/habits_data?user_id=eq.{user_id}", data=body, method="PATCH")
req2.add_header("apikey", SERVICE_KEY)
req2.add_header("Authorization", "Bearer " + SERVICE_KEY)
req2.add_header("Content-Type", "application/json")
req2.add_header("Prefer", "return=minimal")
urllib.request.urlopen(req2, timeout=20)

print(f"\n✅ {updated} cursos actualizados con sílabo en habits_data")
