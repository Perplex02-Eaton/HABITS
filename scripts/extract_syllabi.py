import json, os, urllib.request, time
from pypdf import PdfReader

syllabi = json.load(open(os.path.expanduser("~/.hermes/utp_syllabi.json"), encoding="utf-8"))

results = {}
for name, info in syllabi.items():
    url = info["url"]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        pdf_bytes = urllib.request.urlopen(req, timeout=40).read()
        tmp = os.path.expanduser(f"~/.hermes/syllabus_tmp.pdf")
        open(tmp, "wb").write(pdf_bytes)
        reader = PdfReader(tmp)
        text = "\n\n".join((page.extract_text() or "") for page in reader.pages)
        results[name] = {"courseId": info["courseId"], "sectionId": info["sectionId"], "text": text}
        print(f"OK {name}: {len(text)} chars, {len(reader.pages)} pages")
    except Exception as e:
        print(f"ERR {name}: {e}")

json.dump(results, open(os.path.expanduser("~/.hermes/utp_syllabi_text.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"\nDONE: {len(results)} syllabi extracted")
if results:
    first = list(results.keys())[0]
    print(f"\n--- SAMPLE {first} ---")
    print(results[first]["text"][:700])
