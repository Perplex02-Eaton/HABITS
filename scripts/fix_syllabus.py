
import json, os, urllib.request, unicodedata

SUPABASE_URL = "https://rwyqefehgelmcrrbvbmu.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3eXFlZmVoZ2VsbWNycmJ2Ym11Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjEwNDQ1MCwiZXhwIjoyMTAxNjgwNDUwfQ.AhERdh-CYpAEEHWl8LFTp3DJDcS8wNsGs-vnjqPFMxA"

def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()

syllabi = json.load(open(os.path.expanduser("~/.hermes/utp_syllabi_text.json"), encoding="utf-8"))

req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/habits_data?select=*")
req.add_header("apikey", SERVICE_KEY)
req.add_header("Authorization", "Bearer " + SERVICE_KEY)
rows = json.loads(urllib.request.urlopen(req, timeout=20).read())
row = rows[0]
data = row["data"]
user_id = row["user_id"]
courses = data.get("courses", [])

skw = {norm(k): v for k, v in syllabi.items()}
updated = 0
for course in courses:
    if course.get("syllabus"):
        continue
    kw = norm(course["name"].split(" ")[0])
    for s, sdata in skw.items():
        if kw in s or s in kw:
            course["syllabus"] = sdata["text"]
            course["syllabusName"] = "Sílabo " + course["name"]
            updated += 1
            print(f"OK {course['name']} ({len(sdata['text'])} chars)")
            break

data["courses"] = courses
body = json.dumps({"data": data}).encode()
req2 = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/habits_data?user_id=eq.{user_id}", data=body, method="PATCH")
req2.add_header("apikey", SERVICE_KEY)
req2.add_header("Authorization", "Bearer " + SERVICE_KEY)
req2.add_header("Content-Type", "application/json")
req2.add_header("Prefer", "return=minimal")
urllib.request.urlopen(req2, timeout=20)
print(f"DONE: {updated} more courses with syllabus")
