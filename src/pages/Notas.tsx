import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import type { Note, NoteImage, NoteChecklistItem } from "../lib/types";
import { toast } from "../stores/useToasts";
import { getImage, putImage, deleteImage, listImages, blobToDataUrl } from "../lib/images";
import { improveText } from "../lib/ai";
import Sheet from "../components/ui/Sheet";
import ConfirmSheet from "../components/ui/ConfirmSheet";
import Empty from "../components/ui/Empty";
import PenPad from "../components/PenPad";
import { uid } from "../lib/uid";
import { todayKey } from "../lib/dates";
import {
  IconPlus,
  IconTrash,
  IconPen,
  IconImage,
  IconPin,
  IconSparklesAI
} from "../components/ui/Icons";

function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function useImageUrls(ids: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = ids.join(",");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const map: Record<string, string> = {};
      for (const id of ids) {
        const img = await getImage(id);
        if (!img || !alive) continue;
        map[id] = typeof img.data === "string" ? img.data : await blobToDataUrl(img.data);
      }
      if (alive) setUrls(map);
    };
    void load();
    return () => {
      alive = false;
    };
  }, [key]);
  return urls;
}

interface Draft {
  note: Note | null;
  title: string;
  content: string;
  images: string[];
  drawingId: string | null;
  drawingData: string | null;
  penOpen: boolean;
  checklist: NoteChecklistItem[];
}

const newDraft = (): Draft => ({
  note: null,
  title: "",
  content: "",
  images: [],
  drawingId: null,
  drawingData: null,
  penOpen: false,
  checklist: []
});

export default function Notas() {
  const notes = useStore((s) => s.data.notes);
  const addNote = useStore((s) => s.addNote);
  const updateNote = useStore((s) => s.updateNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const fixedGoals = useStore((s) => s.data.fixedGoals ?? []);
  const addFixedGoal = useStore((s) => s.addFixedGoal);
  const deleteFixedGoal = useStore((s) => s.deleteFixedGoal);
  const setGoalCompletion = useStore((s) => s.setGoalCompletion);
  const ai = useStore((s) => s.data.settings.ai);

  const [filter, setFilter] = useState<"all" | "pinned">("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [library, setLibrary] = useState<NoteImage[]>([]);
  const [viewer, setViewer] = useState<{ id: string; url: string; name: string; kind: NoteImage["kind"] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null);
  const [busyAI, setBusyAI] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = todayKey();

  const refreshLibrary = () => {
    void listImages().then((l) => setLibrary(l.sort((a, b) => b.createdAt - a.createdAt)));
  };
  useEffect(refreshLibrary, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter((n) => (filter === "pinned" ? n.pinned : true))
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [notes, filter, search]);

  const drawingIds = useMemo(
    () => (draft?.drawingId ? [draft.drawingId] : []),
    [draft?.drawingId]
  );
  const drawingUrls = useImageUrls(drawingIds);
  const draftImgUrls = useImageUrls(draft?.images ?? []);
  const libraryUrls = useImageUrls(library.map((l) => l.id));

  const openNote = (n: Note) =>
    setDraft({
      note: n,
      title: n.title,
      content: n.content,
      images: [...n.images],
      drawingId: n.drawingId,
      drawingData: null,
      penOpen: !!n.drawingId,
      checklist: [...(n.checklist ?? [])]
    });

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/") && f.type !== "application/pdf") continue;
      const id = await putImage(f, f.name, f.type === "application/pdf" ? "pdf" : "upload");
      setDraft((d) => (d ? { ...d, images: [...d.images, id] } : d));
    }
    refreshLibrary();
    toast("Archivo adjuntado", "📎");
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() && !draft.content.trim() && draft.images.length === 0 && !draft.drawingData && !draft.penOpen && draft.checklist.length === 0) {
      toast("La nota está vacía", "⚠️");
      return;
    }
    let drawingId = draft.drawingId;
    if (draft.penOpen && draft.drawingData) {
      const id = await putImage(draft.drawingData, `Dibujo ${formatDate(Date.now())}`, "drawing");
      if (drawingId && drawingId !== id) await deleteImage(drawingId).catch(() => {});
      drawingId = id;
    }
    const payload = {
      title: draft.title.trim(),
      content: draft.content.trim(),
      images: draft.images,
      drawingId,
      checklist: draft.checklist.filter((item) => item.text.trim()).map((item) => ({ ...item, text: item.text.trim() })),
      pinned: draft.note?.pinned ?? false
    };
    if (draft.note) {
      updateNote(draft.note.id, payload);
      toast("Nota actualizada", "✏️");
    } else {
      addNote(payload);
      toast("Nota guardada", "📝");
    }
    setDraft(null);
    refreshLibrary();
  };

  const remove = async () => {
    if (!confirmDelete) return;
    for (const id of confirmDelete.images) await deleteImage(id).catch(() => {});
    if (confirmDelete.drawingId) await deleteImage(confirmDelete.drawingId).catch(() => {});
    deleteNote(confirmDelete.id);
    toast("Nota eliminada", "🗑️");
    setConfirmDelete(null);
    refreshLibrary();
  };

  const improve = async () => {
    if (!draft) return;
    if (!draft.content.trim()) {
      toast("Escribe algo primero para mejorar", "✍️");
      return;
    }
    setBusyAI(true);
    const res = await improveText(draft.content, ai, "Corrige y mejora esta nota, mantén el significado.");
    setBusyAI(false);
    setDraft({ ...draft, content: res.text });
    toast(res.usedAi ? "Texto mejorado con IA" : "Corrector local aplicado · configura una IA en Ajustes", res.usedAi ? "✨" : "✏️");
  };

  const deleteLibraryImage = async (id: string) => {
    await deleteImage(id).catch(() => {});
    setDraft((d) => (d ? { ...d, images: d.images.filter((x) => x !== id) } : d));
    refreshLibrary();
    toast("Imagen eliminada", "🗑️");
  };

  const createGoal = () => {
    const title = goalTitle.trim();
    if (!title) {
      toast("Escribe el nombre de la meta", "⚠️");
      return;
    }
    addFixedGoal({ title, targetPerDay: Math.max(1, goalTarget), active: true });
    setGoalTitle("");
    setGoalTarget(1);
    toast("Meta diaria agregada", "🎯");
  };

  const goalProgress = fixedGoals.reduce((sum, goal) => sum + Math.min(goal.completions?.[today] ?? 0, goal.targetPerDay), 0);
  const goalTargetTotal = fixedGoals.reduce((sum, goal) => sum + goal.targetPerDay, 0);
  const goalPercent = goalTargetTotal > 0 ? Math.round((goalProgress / goalTargetTotal) * 100) : 0;

  return (
    <div className="page">
      <header className="page-header">
        <div className="row-between">
          <div>
            <h1 className="page-title">Notas</h1>
            <p className="page-subtitle">Tus ideas, apuntes y dibujos a mano</p>
          </div>
          <button className="btn btn-primary btn-icon" onClick={() => setDraft(newDraft())} aria-label="Nueva nota">
            <IconPlus size={22} />
          </button>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <section className="card card-section notes-goals reveal">
        <div className="row-between">
          <div>
            <div className="list-title">Metas diarias</div>
            <div className="list-sub">
              {fixedGoals.length > 0 ? `${goalProgress}/${goalTargetTotal} cumplidas hoy` : "Crea tareas o metas que se repiten cada día"}
            </div>
          </div>
          {fixedGoals.length > 0 && <span className="badge badge-blue">{goalPercent}%</span>}
        </div>

        {fixedGoals.length > 0 && (
          <div className="notes-goal-progress mt-16"><i style={{ transform: `scaleX(${goalPercent / 100})` }} /></div>
        )}

        <div className="notes-goal-list mt-16">
          {fixedGoals.map((goal) => {
            const count = goal.completions?.[today] ?? 0;
            return (
              <div className="notes-goal-row" key={goal.id}>
                <button
                  className={`notes-goal-check ${count >= goal.targetPerDay ? "done" : ""}`}
                  onClick={() => setGoalCompletion(goal.id, today, count >= goal.targetPerDay ? 0 : goal.targetPerDay)}
                  aria-label={count >= goal.targetPerDay ? "Marcar pendiente" : "Completar meta"}
                >
                  {count >= goal.targetPerDay ? "✓" : ""}
                </button>
                <div className="grow">
                  <div className="list-title" style={{ fontSize: 14 }}>{goal.title}</div>
                  <div className="list-sub">Objetivo diario: {goal.targetPerDay}</div>
                </div>
                <button className="notes-count-button" onClick={() => setGoalCompletion(goal.id, today, Math.max(0, count - 1))}>−</button>
                <span className="notes-goal-count">{count}</span>
                <button className="notes-count-button" onClick={() => setGoalCompletion(goal.id, today, count + 1)}>+</button>
                <button className="btn-icon notes-goal-delete" onClick={() => deleteFixedGoal(goal.id)} aria-label="Eliminar meta">
                  <IconTrash size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="notes-goal-create mt-16">
          <input className="field grow" placeholder="Nueva tarea o meta fija" value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createGoal()} />
          <input className="field notes-goal-target" type="number" min={1} max={99} value={goalTarget} onChange={(event) => setGoalTarget(Math.max(1, Number(event.target.value)))} aria-label="Objetivo diario" />
          <button className="btn btn-primary btn-icon" onClick={createGoal} aria-label="Agregar meta"><IconPlus size={18} /></button>
        </div>
      </section>

      <div className="chips mt-8">
        <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          Todas ({notes.length})
        </button>
        <button className={`chip ${filter === "pinned" ? "active" : ""}`} onClick={() => setFilter("pinned")}>
          <IconPin size={13} /> Fijadas
        </button>
      </div>

      <div className="field-group mt-16">
        <input
          className="field"
          placeholder="Buscar en tus notas…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="stack mt-16">
        {filtered.length === 0 ? (
          <div className="card">
            <Empty
              icon="📓"
              title="Aún no tienes notas"
              subtitle="Crea una: escribe, dibuja con el lápiz o adjunta fotos"
            />
          </div>
        ) : (
          filtered.map((n, i) => (
            <div className="card card-section reveal" key={n.id} style={{ transitionDelay: `${Math.min(i, 6) * 30}ms` }}>
              <div className="row">
                <div className="grow" onClick={() => openNote(n)}>
                  <div className="list-title">
                    {n.pinned && <IconPin size={14} style={{ color: "var(--accent)", marginRight: 4 }} />}
                    {n.title || "Sin título"}
                  </div>
                  <div className="list-sub mt-8" style={{ whiteSpace: "pre-wrap" }}>
                    {n.content.slice(0, 120)}
                    {n.content.length > 120 ? "…" : ""}
                  </div>
                  <div className="row mt-8" style={{ gap: 6 }}>
                    {n.drawingId && <span className="badge badge-blue"><IconPen size={11} /> Dibujo</span>}
                    {n.images.length > 0 && (
                      <span className="badge">📎 {n.images.length}</span>
                    )}
                    {(n.checklist?.length ?? 0) > 0 && (
                      <span className="badge badge-green">✓ {n.checklist.filter((item) => item.done).length}/{n.checklist.length}</span>
                    )}
                    <span className="badge" style={{ opacity: 0.7 }}>{formatDate(n.updatedAt)}</span>
                  </div>
                </div>
                <button
                  className="btn-icon"
                  style={{ color: n.pinned ? "var(--accent)" : "var(--label-tertiary)" }}
                  onClick={() => updateNote(n.id, { pinned: !n.pinned })}
                  aria-label="Fijar"
                >
                  <IconPin size={17} />
                </button>
                <button className="btn-icon" style={{ color: "var(--red)" }} onClick={() => setConfirmDelete(n)}>
                  <IconTrash size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="stack mt-24">
        <h2 className="muted" style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", padding: "0 4px" }}>
          Archivos de estudio · {library.length}
        </h2>
        <div className="card card-section">
          <button className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()}>
            <IconImage size={16} /> Subir PDF o imágenes
          </button>
          <p className="muted small mt-8" style={{ textAlign: "center" }}>
            Los archivos se guardan localmente en este dispositivo
          </p>
          {library.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
              {library.map((im) => {
                const url = libraryUrls[im.id];
                return (
                  <div key={im.id} style={{ position: "relative" }}>
                    <button
                      onClick={() => url && setViewer({ id: im.id, url, name: im.name, kind: im.kind })}
                      style={{ width: "100%", padding: 0, borderRadius: 12, overflow: "hidden", display: "block" }}
                    >
                      {url && im.kind !== "pdf" ? (
                        <img src={url} alt={im.name} style={{ width: "100%", height: 84, objectFit: "cover", display: "block" }} />
                      ) : url && im.kind === "pdf" ? (
                        <div className="notes-pdf-tile"><strong>PDF</strong><small>{im.name}</small></div>
                      ) : (
                        <div style={{ width: "100%", height: 84, background: "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center" }}>…</div>
                      )}
                    </button>
                    {im.kind === "drawing" && (
                      <span className="badge badge-blue" style={{ position: "absolute", top: 4, left: 4, padding: "2px 6px", fontSize: 10 }}>
                        <IconPen size={10} />
                      </span>
                    )}
                    {im.kind === "pdf" && <span className="badge badge-red" style={{ position: "absolute", top: 4, left: 4, padding: "2px 6px", fontSize: 9 }}>PDF</span>}
                    <button
                      className="btn-icon"
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 26,
                        height: 26,
                        background: "rgba(0,0,0,0.55)",
                        color: "#fff"
                      }}
                      onClick={() => deleteLibraryImage(im.id)}
                      aria-label="Eliminar imagen"
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={draft !== null} title={draft?.note ? "Editar nota" : "Nueva nota"} onClose={() => setDraft(null)}>
        {draft && (
          <div>
            <div className="field-group">
              <label className="field-label">Título</label>
              <input className="field" placeholder="Título de la nota" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="field-group">
              <div className="row-between">
                <label className="field-label" style={{ marginBottom: 0 }}>Contenido</label>
                <button className="btn btn-secondary btn-sm" onClick={improve} disabled={busyAI}>
                  <IconSparklesAI size={14} /> {busyAI ? "Mejorando…" : "Mejorar"}
                </button>
              </div>
              <textarea
                className="field mt-8"
                style={{ minHeight: 120 }}
                placeholder="Escribe tus apuntes, análisis o ideas…"
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </div>

            <div className="field-group">
              <div className="row-between">
                <label className="field-label" style={{ marginBottom: 0 }}>Checklist</label>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setDraft({ ...draft, checklist: [...draft.checklist, { id: uid(), text: "", done: false }] })}
                >
                  <IconPlus size={14} /> Agregar
                </button>
              </div>
              {draft.checklist.length === 0 ? (
                <p className="muted small mt-8">Divide el apunte en pasos, pendientes o temas por estudiar.</p>
              ) : (
                <div className="note-checklist-editor mt-8">
                  {draft.checklist.map((item) => (
                    <div className="note-checklist-row" key={item.id}>
                      <button
                        className={`notes-goal-check ${item.done ? "done" : ""}`}
                        onClick={() => setDraft({ ...draft, checklist: draft.checklist.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) })}
                        aria-label={item.done ? "Marcar pendiente" : "Completar"}
                      >
                        {item.done ? "✓" : ""}
                      </button>
                      <input
                        className="field grow"
                        placeholder="Escribe un pendiente"
                        value={item.text}
                        onChange={(event) => setDraft({ ...draft, checklist: draft.checklist.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry) })}
                      />
                      <button className="btn-icon" onClick={() => setDraft({ ...draft, checklist: draft.checklist.filter((entry) => entry.id !== item.id) })} aria-label="Quitar">
                        <IconTrash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="field-group">
              <div className="row-between">
                <label className="field-label" style={{ marginBottom: 0 }}>✏️ Escribir con lápiz</label>
                <button className="btn btn-secondary btn-sm" onClick={() => setDraft({ ...draft, penOpen: !draft.penOpen })}>
                  {draft.penOpen ? "Cerrar" : "Abrir"}
                </button>
              </div>
              {draft.penOpen && (
                <div className="mt-8">
                  <PenPad
                    initial={drawingUrls[draft.drawingId ?? ""] ?? null}
                    onChange={(dataUrl) => setDraft((d) => (d ? { ...d, drawingData: dataUrl } : d))}
                  />
                </div>
              )}
            </div>

            <div className="field-group">
              <div className="row-between">
                <label className="field-label" style={{ marginBottom: 0 }}>PDF e imágenes</label>
                <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                  <IconImage size={14} /> Adjuntar archivo
                </button>
              </div>
              {draft.images.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8 }}>
                  {draft.images.map((id) => {
                    const url = draftImgUrls[id];
                    const attachment = library.find((item) => item.id === id);
                    return (
                      <div key={id} style={{ position: "relative" }}>
                        {url && attachment?.kind !== "pdf" && (
                          <img
                            src={url}
                            alt="adjunto"
                            style={{ width: "100%", height: 84, objectFit: "cover", borderRadius: 12, display: "block" }}
                            onClick={() => setViewer({ id, url, name: attachment?.name ?? "Adjunto", kind: attachment?.kind ?? "upload" })}
                          />
                        )}
                        {url && attachment?.kind === "pdf" && (
                          <button className="notes-pdf-tile" onClick={() => setViewer({ id, url, name: attachment.name, kind: "pdf" })}>
                            <strong>PDF</strong><small>{attachment.name}</small>
                          </button>
                        )}
                        <button
                          className="btn-icon"
                          style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, background: "rgba(0,0,0,0.55)", color: "#fff" }}
                          onClick={() => setDraft((d) => (d ? { ...d, images: d.images.filter((x) => x !== id) } : d))}
                          aria-label="Quitar imagen"
                        >
                          <IconTrash size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button className="btn btn-primary btn-block mt-24" onClick={save}>
              {draft.note ? "Guardar cambios" : "Guardar nota"}
            </button>
          </div>
        )}
      </Sheet>

      {viewer && (
        <div className="sheet-backdrop" style={{ zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setViewer(null)}>
          {viewer.kind === "pdf" ? (
            <iframe
              src={viewer.url}
              title={viewer.name}
              className="notes-pdf-viewer"
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <img
              src={viewer.url}
              alt={viewer.name}
              style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 16, boxShadow: "var(--shadow-float)", background: "#fff" }}
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </div>
      )}

      <ConfirmSheet
        open={confirmDelete !== null}
        title="Eliminar nota"
        message="Se borrará la nota y sus imágenes y dibujos asociados."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
