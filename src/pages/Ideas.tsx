import { useMemo, useState } from "react";
import { useStore } from "../stores/useStore";
import type { Idea } from "../lib/types";
import { uid } from "../lib/uid";
import { toast } from "../stores/useToasts";
import { improveText } from "../lib/ai";
import { buildXPost, buildIgCaption, buildCanvaText, openInX, openCanva, copyText } from "../lib/posts";
import Sheet from "../components/ui/Sheet";
import Empty from "../components/ui/Empty";
import ConfirmSheet from "../components/ui/ConfirmSheet";
import {
  IconPlus,
  IconTrash,
  IconSend,
  IconImage,
  IconCopy,
  IconSparkle,
  IconSparklesAI,
  IconInstagram,
  IconCheck
} from "../components/ui/Icons";

const TOPICS = ["Geopolítica", "Trading", "Oro", "Petróleo", "Fed", "Guerra en mercados", "Cripto", "Macro"];

const STATUS_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "idea", label: "Ideas" },
  { value: "draft", label: "Borradores" },
  { value: "canva", label: "En Canva" },
  { value: "posted", label: "Publicados" }
] as const;

const STATUS_LABEL: Record<Idea["status"], string> = {
  idea: "Idea",
  draft: "Borrador",
  canva: "Diseñando",
  posted: "Publicado"
};

export default function Ideas() {
  const ideas = useStore((s) => s.data.ideas);
  const addIdea = useStore((s) => s.addIdea);
  const updateIdea = useStore((s) => s.updateIdea);
  const deleteIdea = useStore((s) => s.deleteIdea);

  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("todos");
  const [draft, setDraft] = useState<Idea | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Idea | null>(null);
  const [busyAI, setBusyAI] = useState(false);
  const ai = useStore((s) => s.data.settings.ai);

  const filtered = useMemo(
    () => (filter === "todos" ? ideas : ideas.filter((i) => i.status === filter)),
    [ideas, filter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: ideas.length, idea: 0, draft: 0, canva: 0, posted: 0 };
    for (const i of ideas) c[i.status] = (c[i.status] || 0) + 1;
    return c;
  }, [ideas]);

  const startNew = (): Idea => ({
    id: uid(),
    title: "",
    topic: "Geopolítica",
    content: "",
    platform: "x",
    status: "idea",
    createdAt: Date.now()
  });

  const save = () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast("Escribe el tema de la idea", "💡");
      return;
    }
    const existing = ideas.find((i) => i.id === draft.id);
    const status: Idea["status"] = draft.status === "idea" && draft.content.trim() ? "draft" : draft.status;
    if (existing) {
      updateIdea(draft.id, {
        title: draft.title.trim(),
        topic: draft.topic,
        content: draft.content.trim(),
        platform: draft.platform,
        status
      });
      toast("Idea actualizada", "✏️");
    } else {
      addIdea({
        title: draft.title.trim(),
        topic: draft.topic,
        content: draft.content.trim(),
        platform: draft.platform
      });
      if (status === "draft") {
        const list = useStore.getState().data.ideas;
        const justAdded = list[0];
        if (justAdded) updateIdea(justAdded.id, { status: "draft" });
      }
      toast(status === "draft" ? "Borrador listo" : "Idea guardada", "💡");
    }
    setDraft(null);
  };

  const setStatus = (i: Idea, status: Idea["status"]) => {
    updateIdea(i.id, { status });
    toast(status === "posted" ? "¡Publicado! 🎉" : "Estado actualizado", "✅");
  };

  const improve = async () => {
    if (!draft) return;
    if (!draft.content.trim()) {
      toast("Escribe tu análisis primero", "✍️");
      return;
    }
    setBusyAI(true);
    const res = await improveText(
      draft.content,
      ai,
      "Corrige y mejora este post de análisis de geopolítica/trading. Mantén la esencia, hazlo claro y directo."
    );
    setBusyAI(false);
    setDraft({ ...draft, content: res.text });
    toast(res.usedAi ? "Texto mejorado con IA" : "Corrector local aplicado · configura una IA en Ajustes", res.usedAi ? "✨" : "✏️");
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="row-between">
          <div>
            <h1 className="page-title">Ideas</h1>
            <p className="page-subtitle">Publica tu análisis de geopolítica y trading</p>
          </div>
          <button className="btn btn-primary btn-icon" onClick={() => setDraft(startNew())} aria-label="Nueva idea">
            <IconPlus size={22} />
          </button>
        </div>
      </header>

      <div className="segmented mt-8" style={{ overflowX: "auto" }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} className={filter === f.value ? "active" : ""} onClick={() => setFilter(f.value)}>
            {f.label} {counts[f.value] > 0 ? `· ${counts[f.value]}` : ""}
          </button>
        ))}
      </div>

      <div className="stack mt-24">
        {filtered.length === 0 ? (
          <div className="card">
            <Empty
              icon="💡"
              title={filter === "todos" ? "Aún no tienes ideas" : "Nada en esta sección"}
              subtitle="Captura tu próximo análisis: geopolítica, oro, petróleo, Fed…"
            />
          </div>
        ) : (
          filtered.map((i, idx) => {
            const xText = buildXPost(i);
            const ig = buildIgCaption(i);
            const canva = buildCanvaText(i);
            const posted = i.status === "posted";
            return (
              <div className="card card-section reveal" key={i.id} style={{ transitionDelay: `${idx * 40}ms`, opacity: posted ? 0.75 : 1 }}>
                <div className="row-between">
                  <div className="row">
                    <span className={`badge ${i.platform === "x" ? "" : i.platform === "instagram" ? "badge-purple" : "badge-teal"}`}>
                      {i.platform === "x" ? "𝕏" : i.platform === "instagram" ? "IG" : "𝕏 + IG"}
                    </span>
                    <span className={`badge ${i.status === "posted" ? "badge-green" : i.status === "canva" ? "badge-orange" : "badge-blue"}`}>
                      {STATUS_LABEL[i.status]}
                    </span>
                  </div>
                  <button className="btn-icon" style={{ color: "var(--label-tertiary)" }} onClick={() => setConfirmDelete(i)}>
                    <IconTrash size={16} />
                  </button>
                </div>

                <h3 className="list-title mt-16" style={{ fontSize: 18 }}>{i.title}</h3>
                <p className="muted mt-8" style={{ fontSize: 14, lineHeight: 1.5 }}>{i.content}</p>

                {i.status !== "idea" && (
                  <div className="card mt-16" style={{ background: "var(--fill)", boxShadow: "none", borderRadius: 14 }}>
                    <div style={{ padding: 14 }}>
                      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
                        <IconSparkle size={15} style={{ color: "var(--accent)" }} />
                        <span className="small" style={{ fontWeight: 600 }}>Texto listo para publicar</span>
                      </div>
                      <p className="small muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {i.platform === "instagram" || i.platform === "ambos" ? ig : xText}
                      </p>
                    </div>
                  </div>
                )}

                <div className="row mt-16" style={{ flexWrap: "wrap", gap: 8 }}>
                  {(i.platform === "x" || i.platform === "ambos") && i.status !== "idea" && (
                    <button className="btn btn-secondary btn-sm" onClick={() => openInX(xText)}>
                      <IconSend size={14} /> Abrir en X
                    </button>
                  )}
                  {(i.platform === "instagram" || i.platform === "ambos") && (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          copyText(ig).then((ok) => toast(ok ? "Caption copiado" : "No se pudo copiar", ok ? "📋" : "⚠️"))
                        }
                      >
                        <IconCopy size={14} /> Copiar caption
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          openCanva(canva.title);
                          if (i.status !== "posted") setStatus(i, "canva");
                          toast("Plantilla de Canva abierta", "🎨");
                        }}
                      >
                        <IconImage size={14} /> Crear en Canva
                      </button>
                    </>
                  )}
                  {!posted && (
                    <button className="btn btn-secondary btn-sm" style={{ color: "var(--green)" }} onClick={() => setStatus(i, "posted")}>
                      <IconCheck size={14} /> Marcar publicado
                    </button>
                  )}
                  {posted && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setStatus(i, "draft")}>
                      Reabrir
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Sheet open={draft !== null} title={draft?.content ? "Editar idea" : "Nueva idea"} onClose={() => setDraft(null)}>
        {draft && (
          <div>
            <div className="field-group">
              <label className="field-label">Tema / gancho *</label>
              <input
                className="field"
                placeholder="Ej. El petróleo ruso y el futuro del dólar"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Área</label>
              <div className="chips">
                {TOPICS.map((t) => (
                  <button key={t} className={`chip ${draft.topic === t ? "active" : ""}`} onClick={() => setDraft({ ...draft, topic: t })}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-group">
              <div className="row-between">
                <label className="field-label" style={{ marginBottom: 0 }}>Contenido / análisis</label>
                <button className="btn btn-secondary btn-sm" onClick={improve} disabled={busyAI}>
                  <IconSparklesAI size={14} /> {busyAI ? "Mejorando…" : "Mejorar"}
                </button>
              </div>
              <textarea
                className="field mt-8"
                placeholder="Escribe tu análisis. El asistente lo convertirá en post de X y caption de Instagram."
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">¿Dónde lo publicarás?</label>
              <div className="chips">
                <button className={`chip ${draft.platform === "x" ? "active" : ""}`} onClick={() => setDraft({ ...draft, platform: "x" })}>
                  𝕏 Twitter
                </button>
                <button className={`chip ${draft.platform === "instagram" ? "active" : ""}`} onClick={() => setDraft({ ...draft, platform: "instagram" })}>
                  <IconInstagram size={14} /> Instagram
                </button>
                <button className={`chip ${draft.platform === "ambos" ? "active" : ""}`} onClick={() => setDraft({ ...draft, platform: "ambos" })}>
                  Ambos
                </button>
              </div>
            </div>
            <div className="stack mt-24">
              <button className="btn btn-primary btn-block" onClick={save}>
                {draft.content ? "Guardar borrador" : "Guardar idea"}
              </button>
              {draft.content && (
                <p className="muted small" style={{ textAlign: "center" }}>
                  Al guardar podrás: abrir en X, copiar caption o crear el diseño en Canva.
                </p>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={confirmDelete !== null}
        title="Eliminar idea"
        message="Esta idea y sus borradores se eliminarán."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            deleteIdea(confirmDelete.id);
            toast("Idea eliminada", "🗑️");
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}
