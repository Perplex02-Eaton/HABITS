import Sheet from "./Sheet";

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}

export default function ConfirmSheet({
  open,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "Eliminar"
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <p className="muted" style={{ fontSize: 16, lineHeight: 1.5 }}>
        {message}
      </p>
      <div className="stack mt-24">
        <button className="btn btn-danger btn-block" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="btn btn-secondary btn-block" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </Sheet>
  );
}
