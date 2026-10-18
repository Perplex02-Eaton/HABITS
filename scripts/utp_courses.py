#!/usr/bin/env python3
"""
HABITS ⇄ UTP+class · Memoria de clases (sílabo -> semanas)
==========================================================
Convierte el texto del sílabo ya descargado (~/.hermes/utp_syllabi_text.json)
en una MEMORIA ESTRUCTURADA del curso: unidad, semana, sesión, tema y
actividades/evaluaciones. Es lo que permite a Jarvis "recordar todas las
clases ya subidas" y responder por semana ("¿qué toca esta semana?").

Salida:
  ~/.hermes/utp_courses.json      memoria completa
  public/utp-courses.json         copia que lee la app HABITS / Jarvis

Uso:
  python utp_courses.py             # regenera la memoria
  python utp_courses.py --week 10   # resumen de la semana N
  python utp_courses.py --raw X     # filas por semana (X = trozo del curso)
"""

import json
import os
import re
import sys
import time
import unicodedata

HOME = os.path.expanduser("~/.hermes")
SYLLABI_TEXT = os.path.join(HOME, "utp_syllabi_text.json")
COURSES_JSON = os.path.join(HOME, "utp_courses.json")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_JSON = os.path.join(ROOT, "public", "utp-courses.json")

# Ciclo 2026-2: inicia lunes 10 de agosto de 2026 (18 semanas)
CYCLE_START = os.environ.get("UTP_CYCLE_START", "2026-08-10")
WEEKS_PER_CYCLE = int(os.environ.get("UTP_WEEKS", "18"))

END_MARKERS = (
    "SISTEMA DE EVALUACI", "METODOLOG", "REFERENCIAS BIBLIOGR", "BIBLIOGRAF",
    "RECURSOS EDUCATIVOS", "LINEAMIENTOS", "ANEXOS", "RUBRICA", "RÚBRICA",
)
NOISE = (
    "unidad de aprendizaje", "semana", "sesión", "sesion", "tema",
    "actividades y", "evaluaciones", "cronograma de actividades",
)
# Frases con las que EMPIEZA cada actividad de la columna "Actividades y evaluaciones".
# OJO: "evaluación" solo cuenta como actividad si le sigue un nombre de evaluación
# ("Evaluación TAREA ACADÉMICA 1"); un TEMA puede empezar con "Evaluación de términos
# de pago…" y no debe confundirse con una actividad.
ACTIVITY_STARTS = (
    "exposicion de los temas", "revision de los materiales", "presentacion del curso",
    "eleccion del delegado", "formacion de grupos", "examen", "practica calificada",
    "trabajo final", "participacion", "foro", "avance de la tarea academica",
)
_ACT_RE = re.compile(
    "|".join(re.escape(a) for a in ACTIVITY_STARTS) +
    r"|evaluacion\s+(?=(?:tarea|trabajo|examen|parcial|practica|final|unidad|integradora|de la unidad))"
)
ACTIVITY_KINDS = (
    ("avance de la tarea academica", "entregable"), ("tarea academica", "entregable"),
    ("trabajo de investigacion", "trabajo"), ("trabajo final", "trabajo"),
    ("examen final", "examen"), ("examen", "examen"), ("evaluacion", "evaluacion"),
    ("practica calificada", "practica"), ("exposicion", "exposicion"),
    ("revision de los materiales", "repaso"), ("presentacion del curso", "presentacion"),
    ("participacion", "participacion"), ("foro", "foro"),
)
# Palabras tras las que un número suelto SÍ es parte del nombre de la evaluación
# ("TAREA ACADÉMICA" + "3", "TRABAJO" + "FINAL"); en cualquier otro caso un número
# suelto es la celda "Semana" de la tabla y se descarta del texto.
LABEL_CONTEXT = ("tarea academica", "trabajo", "practica", "examen", "unidad", "avance", "foro")
# Etiquetas que, por sí solas, no son el tema de una clase (son el nombre de una
# evaluación cortado por el salto de página/columna de la tabla aplanada).
LABEL_WORDS = {
    "investigacion", "final", "de", "del", "la", "el", "en", "y", "trabajo",
    "academica", "evaluacion", "examen", "practica", "foro", "participacion", "clase",
    "1", "2", "3", "4", "5", "n°", "n",
}
INCOMPLETE_TAIL = ("de", "del", "la", "el", "en", "y", "trabajo", "final", "academica", "evaluacion")
EVAL_KINDS = ("entregable", "examen", "evaluacion", "practica", "trabajo")


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


def flat(s):
    """Minúsculas sin acentos, SIN colapsar espacios (1:1 con el original)."""
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def bare_number(line):
    m = re.fullmatch(r"(\d{1,2})\s*", line or "")
    return int(m.group(1)) if m else None


def cronograma_lines(text):
    lines = [l.strip() for l in (text or "").splitlines()]
    start = None
    for i, l in enumerate(lines):
        if norm(l).startswith("cronograma de actividades"):
            start = i + 1
            break
    if start is None:
        return []
    out = []
    for l in lines[start:]:
        nl = norm(l)
        if not l:
            continue
        if any(nl.startswith(m.lower()) for m in END_MARKERS) and not re.match(r"^\d", nl):
            break
        if nl in NOISE:
            continue
        out.append(l)
    return out


# --------------------------------------------------------- unidades del sílabo
def section_units(text):
    """'Unidad de aprendizaje N: <nombre> Semana <semanas>' — fuente autoritativa
    de los nombres de unidad y de las semanas que cubre cada una."""
    units = {}
    pat = re.compile(r"Unidad\s+de\s+aprendizaje\s+(\d)\s*:?\s*\n?", re.IGNORECASE)
    for m in pat.finditer(text or ""):
        no = int(m.group(1))
        lines = [l.strip() for l in text[m.end():m.end() + 240].splitlines() if l.strip()]
        name_lines, weeks = [], []
        for i, l in enumerate(lines):
            if norm(l).startswith("semana"):
                ws = re.sub(r"(?i)semana", "", l).strip(" :")
                if not re.findall(r"\d{1,2}", ws) and i + 1 < len(lines):
                    ws = lines[i + 1]
                weeks = [int(x) for x in re.findall(r"\d{1,2}", ws)]
                break
            if norm(l).startswith(("logro", "al finalizar")):
                break
            name_lines.append(l)
        name = re.sub(r"\s+", " ", " ".join(name_lines)).strip(" .;:")
        units.setdefault(no, {"no": no, "name": name, "weeks": weeks})
    return units


# --------------------------------------------------------------- filas de la tabla
def parse_rows(lines):
    """La tabla aplanada es [semana][sesión][tema...][actividades...]: cada celda
    numérica cae en su propia línea. La columna "Sesión" es exactamente la
    secuencia 1..N, así que es el ancla: un número v es una SESIÓN si v ==
    last_session+1. Cualquier otro número suelto es la celda "Semana" (que se
    repite una vez por semana, no siempre alineada con su fila) o texto
    ("TAREA ACADÉMICA 3"); ninguno se usa para numerar y todos se descartan del
    texto salvo que sigan a un nombre de evaluación."""
    num_idx = [i for i, l in enumerate(lines) if bare_number(l) is not None]
    rows, col_idx, last_session = [], set(), 0
    for i in num_idx:
        v = bare_number(lines[i])
        if v == last_session + 1:
            rows.append({"session": v, "start": i})
            last_session = v
            col_idx.add(i)
    return rows, col_idx


def keep_number_line(lines, idx):
    """¿Un número suelto es parte del nombre de una evaluación? Solo si la línea
    anterior con texto termina en 'TAREA ACADÉMICA' / 'TRABAJO' / 'EXAMEN' / …"""
    j = idx - 1
    while j >= 0:
        if lines[j]:
            return any(norm(lines[j]).endswith(w) for w in LABEL_CONTEXT)
        j -= 1
    return False


def split_activities(text):
    """Trocea la columna de actividades en sus frases ('Exposición de los temas…',
    'Revisión de los materiales…', 'Evaluación TAREA ACADÉMICA 1', …). Se buscan
    TODAS las apariciones de cada frase (una fila puede repetir 'Evaluación' dos
    veces) sobre el texto sin acentos, que conserva los offsets del original."""
    f = flat(text)
    if len(f) != len(text):                 # salvaguarda: offsets deben coincidir
        return [re.sub(r"\s+", " ", text).strip(" .;:")] if text.strip() else []
    marks = sorted({m.start() for m in _ACT_RE.finditer(f)})
    if not marks:
        t = re.sub(r"\s+", " ", text).strip(" .;:")
        return [t] if t else []
    out = []
    for k, p in enumerate(marks):
        end = marks[k + 1] if k + 1 < len(marks) else len(text)
        seg = re.sub(r"\s+", " ", text[p:end]).strip(" .;:")
        if not seg:
            continue
        if out and seg.isdigit():          # el "1" de "TAREA ACADÉMICA 1"
            out[-1] = (out[-1] + " " + seg).strip()
        else:
            out.append(seg)
    return out


def classify(chunks):
    acts = []
    for c in chunks:
        n = norm(c)
        if not n:
            continue
        # gana la frase que APARECE PRIMERO en el texto (el trozo empieza por ella),
        # no la primera del catálogo: "Revisión de los materiales… Evaluación" es
        # un repaso, no una evaluación.
        best = None
        for pat, kind in ACTIVITY_KINDS:
            p = n.find(pat)
            if p >= 0 and (best is None or p < best[0]):
                best = (p, kind)
        if best:
            acts.append({"text": c[:90], "kind": best[1]})
    uniq, seen = [], set()
    for a in acts:
        k = norm(a["text"])
        if k not in seen:
            seen.add(k)
            uniq.append(a)
    return uniq


def is_label_topic(topic):
    n = norm(topic)
    words = n.split()
    if not words or len(words) > 3:
        return False
    return all(w.strip(",.;:") in LABEL_WORDS for w in words)


def incomplete_tail(chunk):
    n = norm(chunk)
    return bool(n) and n.split()[-1].strip(",.;:") in INCOMPLETE_TAIL and len(n.split()) <= 5


def parse_course(name, info, units_sec=None):
    lines = cronograma_lines(info.get("text", ""))
    rows, col_idx = parse_rows(lines)

    # --- unidades: sección "Unidad de aprendizaje" + respaldo del cronograma
    units = {no: {"no": no, "name": u.get("name", ""), "weeks": u.get("weeks", [])}
             for no, u in (units_sec or {}).items()}
    for i, l in enumerate(lines):
        m = re.match(r"^Unidad\s+(\d+)\s*[:.]?\s*(.*)$", l, re.IGNORECASE)
        if not m:
            continue
        no = int(m.group(1))
        nm = (m.group(2) or "").strip(" .;:")
        if not nm:
            got = []
            for l2 in lines[i + 1: i + 7]:
                if bare_number(l2) is not None or norm(l2).startswith("unidad"):
                    break
                got.append(l2)
            nm = " ".join(got)
        nm = re.sub(r"\s+", " ", nm).strip(" .;:")
        u = units.setdefault(no, {"no": no, "name": "", "weeks": []})
        if nm and (not u["name"] or len(nm) > len(u["name"])):
            u["name"] = nm

    unit_marks = [(i, int(m.group(1)))
                  for i, l in enumerate(lines)
                  for m in [re.match(r"^Unidad\s+(\d+)\s*$", l, re.IGNORECASE)] if m]

    def unit_for(idx):
        found = None
        for i, no in unit_marks:
            if i < idx:
                found = no
        return found

    # --- semanas: derivadas de la secuencia de sesiones (N sesiones por semana).
    # Los sílabos UTP son uniformes (2 sesiones/semana); el nº de semanas sale de
    # las unidades de la sección "Unidad de aprendizaje" y se acota al ciclo.
    max_week = max([w for u in units.values() for w in u["weeks"]] or [WEEKS_PER_CYCLE])
    max_week = max(max_week, 1)
    per_week = max(1, int(round(len(rows) / float(max_week)))) if rows else 1

    # semana -> unidad, según los rangos de semanas declarados por cada unidad
    unit_by_week = {}
    for no, u in units.items():
        for w in u["weeks"]:
            unit_by_week.setdefault(w, no)

    def week_of_session(s):
        return min(max_week, (s - 1) // per_week + 1)

    # --- cada fila: tema (antes de la columna de actividades) y actividades
    sessions = []
    for k, r in enumerate(rows):
        end = rows[k + 1]["start"] if k + 1 < len(rows) else len(lines)
        idxs = []
        for ii in range(r["start"] + 1, end):
            if ii in col_idx:
                continue
            if bare_number(lines[ii]) is not None and not keep_number_line(lines, ii):
                continue      # celda "Semana" suelta
            idxs.append(ii)
        region = [(ii, lines[ii]) for ii in idxs]
        raw = " ".join(l for _, l in region)
        fl = flat(raw)
        if len(fl) != len(raw):            # salvaguarda: offsets deben coincidir
            fl = raw.lower()

        # corte: empieza la columna de actividades o la cabecera de la unidad siguiente
        m_act = _ACT_RE.search(fl)
        cut_act = m_act.start() if m_act else len(fl)
        m_unit = re.search(r"unidad\s+\d", fl)
        cut_unit = m_unit.start() if m_unit else len(fl)

        # el tema es lo anterior a cualquiera de los dos cortes; las actividades van
        # SOLO hasta la cabecera de unidad (si no, se cuela "Unidad 2 Oportunidades…")
        topic = re.sub(r"\s+", " ", raw[:min(cut_act, cut_unit)]).strip(" .;:")
        act_text = (re.sub(r"\s+", " ", raw[cut_act:cut_unit]).strip(" .;:")
                    if cut_act < cut_unit else "")
        s = week_of_session(r["session"])
        sessions.append({
            "session": r["session"], "week": s,
            "unit_no": unit_by_week.get(s, unit_for(r["start"])),
            "topic": topic, "chunks": split_activities(act_text),
        })

    # --- arreglos de la tabla aplanada
    # (1) una etiqueta partida por el salto de columna: el trozo final incompleto
    #     ('Evaluación TRABAJO DE') pertenece a la sesión siguiente
    for k in range(len(sessions) - 1):
        ch = sessions[k]["chunks"]
        if ch and incomplete_tail(ch[-1]):
            sessions[k + 1]["chunks"].insert(0, ch.pop())
    # (2) el resto de la etiqueta quedó como "tema" ('INVESTIGACIÓN')
    for s in sessions:
        if is_label_topic(s["topic"]):
            ch = s["chunks"]
            if ch and incomplete_tail(ch[-1]):
                ch[-1] = (ch[-1] + " " + s["topic"]).strip()
            else:
                ch.append(s["topic"])
            s["topic"] = ""

    # (3) etiquetas genéricas que son prefijo de otra más completa ('Evaluación')
    every = [norm(c) for s in sessions for c in s["chunks"]]
    for s in sessions:
        s["chunks"] = [c for c in s["chunks"]
                       if not any(e != norm(c) and e.startswith(norm(c)) for e in every)]
        s["activities"] = classify(s["chunks"])

    # --- agrupar por semana
    weeks = {}
    for s in sessions:
        no = s["unit_no"]
        w = weeks.setdefault(s["week"], {"week": s["week"], "unit_no": no,
                                        "unit": (units.get(no) or {}).get("name", ""),
                                        "sessions": [], "topics": [], "activities": []})
        w["sessions"].append({"n": s["session"], "topic": s["topic"], "activities": s["activities"]})
        if s["topic"]:
            w["topics"].append(s["topic"])
        w["activities"].extend(s["activities"])
        if not w["unit"] and no:
            w["unit"], w["unit_no"] = (units.get(no) or {}).get("name", ""), no

    for w in weeks.values():
        for s in w["sessions"]:                      # el tema nunca es parte de una etiqueta
            for d in w["activities"]:
                if s["topic"] and norm(s["topic"]) in norm(d["text"]):
                    s["topic"] = ""
        w["topics"] = [t for t in w["topics"]]
        evals = [a for a in w["activities"] if a["kind"] in EVAL_KINDS]
        kinds = {a["kind"] for a in w["activities"]}
        w["has_deliverable"] = bool(evals)
        w["deliverables"] = list(dict.fromkeys(a["text"] for a in evals))
        w["mode"] = ("evaluacion" if evals else
                     "exposicion" if "exposicion" in kinds else "clase")
        w["summary"] = (w["topics"][0] if w["topics"] else
                        (w["deliverables"][0] if w["deliverables"] else "Revisión de materiales"))

    return {
        "course": name,
        "courseId": info.get("courseId", ""),
        "sectionId": info.get("sectionId", ""),
        "sessions_per_week": per_week,
        "sessions_count": len(sessions),
        "weeks_count": len(weeks),
        "units": [units[n] for n in sorted(units)],
        "weeks": [weeks[k] for k in sorted(weeks)],
        "sessions": sessions,
    }


# --------------------------------------------------------------------- salidas
def week_of(cycle_start=CYCLE_START, when=None):
    from datetime import date, datetime
    y, m, d = (int(x) for x in cycle_start.split("-"))
    start = date(y, m, d)
    today = when or datetime.now().date()
    return max(1, (today - start).days // 7 + 1)


def build():
    try:
        with open(SYLLABI_TEXT, encoding="utf-8") as f:
            src = json.load(f)
    except Exception as e:
        print("No pude leer %s: %s" % (SYLLABI_TEXT, e))
        sys.exit(1)

    courses = {name: parse_course(name, info, section_units(info.get("text", "")))
               for name, info in src.items()}
    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "cycle_start": CYCLE_START,
        "weeks_per_cycle": WEEKS_PER_CYCLE,
        "current_week": week_of(),
        "courses": courses,
    }
    with open(COURSES_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.makedirs(os.path.dirname(PUBLIC_JSON), exist_ok=True)
    with open(PUBLIC_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return payload


def print_week(payload, week):
    print("SEMANA %d de %d (ciclo desde %s)\n" % (week, payload["weeks_per_cycle"], payload["cycle_start"]))
    for name, c in payload["courses"].items():
        w = next((x for x in c["weeks"] if x["week"] == week), None)
        if not w:
            print("• %s: sin datos de la semana %d (sílabo: %d semanas)" % (name, week, c["weeks_count"]))
            continue
        print("• %s — Unidad %s: %s" % (name, w["unit_no"], w["unit"] or "?"))
        for t in w["topics"]:
            print("    tema: %s" % t[:190])
        if w["deliverables"]:
            print("    ENTREGA/EVAL: %s" % ", ".join(w["deliverables"]))
        else:
            print("    sin entrega — %s" % w["mode"])
        print()


if __name__ == "__main__":
    if "--week" in sys.argv:
        wk = int(sys.argv[sys.argv.index("--week") + 1])
        print_week(json.load(open(COURSES_JSON, encoding="utf-8")), wk)
        sys.exit(0)
    if "--raw" in sys.argv:
        want = sys.argv[sys.argv.index("--raw") + 1].upper()
        d = json.load(open(COURSES_JSON, encoding="utf-8"))
        c = next((v for k, v in d["courses"].items() if want in k.upper()), None)
        if not c:
            print("Curso no encontrado")
            sys.exit(1)
        print("%s — %d sesiones / %d semanas" % (c["course"], c["sessions_count"], c["weeks_count"]))
        for u in c["units"]:
            print("  U%s %s | semanas %s" % (u["no"], u["name"], u["weeks"]))
        for w in c["weeks"]:
            print("semana %2d | u%s | %-10s | %s" % (
                w["week"], w["unit_no"], w["mode"],
                ", ".join(w["deliverables"]) or w["summary"][:70]))
            for s in w["sessions"]:
                print("    s%-3d %s" % (s["n"], s["topic"][:120]))
        sys.exit(0)

    p = build()
    print("Memoria de clases -> %s" % COURSES_JSON)
    print("                   -> %s" % PUBLIC_JSON)
    print("Semana actual del ciclo: %d" % p["current_week"])
    for name, c in p["courses"].items():
        print("  %-42s %2d sesiones / %2d semanas | %s" % (
            name[:42], c["sessions_count"], c["weeks_count"],
            "; ".join("U%s %s" % (u["no"], u["name"][:30]) for u in c["units"])))
