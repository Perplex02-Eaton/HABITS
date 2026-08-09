import { useMemo, useState } from "react";
import { useStore } from "../stores/useStore";
import type { Meal, MealPlan, MealType } from "../lib/types";
import { MEAL_TYPES } from "../lib/types";
import { todayKey, addDays, formatShort } from "../lib/dates";
import { uid } from "../lib/uid";
import { toast } from "../stores/useToasts";
import Sheet from "../components/ui/Sheet";
import ConfirmSheet from "../components/ui/ConfirmSheet";
import { IconPlus, IconTrash, IconCheck, IconCopy, IconPencil } from "../components/ui/Icons";

interface MealDraft {
  planDate: string;
  meal: Meal | null;
}

const emptyPlan = (date: string): MealPlan => ({ id: uid(), date, meals: [] });

export default function Meals() {
  const mealPlans = useStore((s) => s.data.mealPlans);
  const upsertMealPlan = useStore((s) => s.upsertMealPlan);
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<MealDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MealDraft | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(todayKey(), i)), []);
  const date = days[selected];
  const plan = mealPlans.find((p) => p.date === date);

  const getMeal = (type: MealType) => plan?.meals.find((m) => m.type === type);

  const copyFrom = (sourceDate: string) => {
    const source = mealPlans.find((p) => p.date === sourceDate);
    if (!source || source.meals.length === 0) {
      toast("No hay plan en ese día", "⚠️");
      return;
    }
    const target = plan ?? emptyPlan(date);
    const meals = source.meals.map((m) => ({ ...m, id: uid() }));
    upsertMealPlan({ ...target, id: target.id || uid(), date, meals });
    toast("Plan copiado", "📋");
  };

  const saveMeal = (d: MealDraft) => {
    if (!d.meal?.name.trim()) {
      toast("Escribe qué vas a consumir", "🍽️");
      return;
    }
    const target = plan ?? emptyPlan(d.planDate);
    const existing = target.meals.find((m) => m.id === d.meal!.id);
    const meals = existing
      ? target.meals.map((m) => (m.id === d.meal!.id ? d.meal! : m))
      : [...target.meals.filter((m) => m.type !== d.meal!.type), d.meal!];
    upsertMealPlan({ ...target, id: target.id || uid(), meals });
    toast("Plan actualizado", "✅");
    setDraft(null);
  };

  const removeMeal = () => {
    if (!confirmDelete) return;
    const target = plan ?? emptyPlan(confirmDelete.planDate);
    upsertMealPlan({
      ...target,
      id: target.id || uid(),
      meals: target.meals.filter((m) => m.id !== confirmDelete.meal!.id)
    });
    toast("Comida eliminada", "🗑️");
    setConfirmDelete(null);
  };

  const toggleConsumed = (meal: Meal) => {
    const target = plan ?? emptyPlan(date);
    upsertMealPlan({
      ...target,
      id: target.id || uid(),
      meals: target.meals.map((m) => (m.id === meal.id ? { ...m, consumed: !m.consumed } : m))
    });
  };

  const consumedCount = plan?.meals.filter((m) => m.consumed).length ?? 0;
  const totalCount = plan?.meals.length ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div className="row-between">
          <div>
            <h1 className="page-title">Alimentación</h1>
            <p className="page-subtitle">Planifica qué vas a consumir los próximos días</p>
          </div>
        </div>
      </header>

      <div className="card card-section">
        <div className="row-between">
          <div>
            <div className="list-title">{selected === 0 ? "Hoy" : selected === 1 ? "Mañana" : formatShort(date)}</div>
            <div className="list-sub">{totalCount === 0 ? "Sin plan todavía" : `${consumedCount} de ${totalCount} consumidas`}</div>
          </div>
          <span className="badge badge-blue">{selected === 0 ? "Hoy" : `Día +${selected}`}</span>
        </div>
        <div className="chips mt-16">
          {days.slice(0, 7).map((d, i) => (
            <button key={d} className={`chip ${i === selected ? "active" : ""}`} onClick={() => setSelected(i)}>
              {i === 0 ? "Hoy" : i === 1 ? "Mañana" : formatShort(d)}
            </button>
          ))}
        </div>
      </div>

      <div className="stack mt-24">
        {MEAL_TYPES.map((t, i) => {
          const meal = getMeal(t.value);
          return (
            <div className="card card-section reveal" key={t.value} style={{ transitionDelay: `${i * 40}ms` }}>
              <div className="row">
                <span style={{ fontSize: 26 }}>{t.icon}</span>
                <div className="grow">
                  <div className="list-title">{t.label}</div>
                  {meal ? (
                    <div className="list-sub" style={meal.consumed ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                      {meal.name}
                      {meal.notes ? ` — ${meal.notes}` : ""}
                    </div>
                  ) : (
                    <div className="list-sub">Nada planificado</div>
                  )}
                </div>
                {meal && (
                  <button
                    className={`btn-icon ${meal.consumed ? "" : ""}`}
                    style={meal.consumed ? { background: "var(--green-soft)", color: "var(--green)" } : { background: "var(--fill)", color: "var(--label-secondary)" }}
                    onClick={() => toggleConsumed(meal)}
                    aria-label="Marcar consumida"
                  >
                    <IconCheck size={18} />
                  </button>
                )}
                <button className="btn-icon" onClick={() => setDraft({ planDate: date, meal: meal ?? { id: uid(), type: t.value, name: "", notes: "", consumed: false } })}>
                  {meal ? <IconPencil size={18} /> : <IconPlus size={18} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card card-section mt-24">
        <div className="row-between">
          <div>
            <div className="list-title">Copiar plan</div>
            <div className="list-sub">Reutiliza la comida de otro día</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => copyFrom(addDays(date, -1))}>
              <IconCopy size={13} /> Ayer
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => copyFrom(addDays(date, +1))}>
              <IconCopy size={13} /> Mañana
            </button>
          </div>
        </div>
      </div>

      <div className="card card-section mt-16">
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          💡 Consejo: planea tus comidas de <b>mañana</b> hoy mismo. La app te lo recordará cuando toque consumir.
        </p>
      </div>

      <Sheet open={draft !== null} title={draft?.meal?.name ? "Editar comida" : "Agregar comida"} onClose={() => setDraft(null)}>
        {draft && (
          <div>
            <div className="field-group">
              <label className="field-label">Tipo</label>
              <div className="chips">
                {MEAL_TYPES.map((t) => (
                  <button
                    key={t.value}
                    className={`chip ${draft.meal?.type === t.value ? "active" : ""}`}
                    onClick={() => setDraft({ ...draft, meal: { ...draft.meal!, type: t.value } })}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Qué vas a consumir *</label>
              <input
                className="field"
                placeholder="Ej. Pollo a la plancha + quinoa"
                value={draft.meal?.name}
                onChange={(e) => setDraft({ ...draft, meal: { ...draft.meal!, name: e.target.value } })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Notas / porción</label>
              <textarea
                className="field"
                placeholder="Ej. 150g, sin sal, con limón"
                value={draft.meal?.notes}
                onChange={(e) => setDraft({ ...draft, meal: { ...draft.meal!, notes: e.target.value } })}
              />
            </div>
            <div className="row mt-24" style={{ gap: 10 }}>
              <button className="btn btn-primary grow" onClick={() => saveMeal(draft)}>Guardar</button>
              {draft.meal?.name && (
                <button className="btn btn-danger" onClick={() => setConfirmDelete(draft)}>
                  <IconTrash size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={confirmDelete !== null}
        title="Eliminar comida"
        message="Se quitará esta comida del plan de ese día."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={removeMeal}
      />
    </div>
  );
}
