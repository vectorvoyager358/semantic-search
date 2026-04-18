import { useEffect, useId, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  variant?: "danger" | "default";
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={
        variant === "danger"
          ? "confirm-dialog confirm-dialog--danger"
          : "confirm-dialog"
      }
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={() => onCancel()}
    >
      <div className="confirm-dialog__panel">
        <h2 id={titleId} className="confirm-dialog__title">
          {title}
        </h2>
        <p id={descId} className="confirm-dialog__message">
          {message}
        </p>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              variant === "danger"
                ? "btn btn--danger btn--sm"
                : "btn btn--primary btn--sm"
            }
            onClick={() => void Promise.resolve(onConfirm())}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
