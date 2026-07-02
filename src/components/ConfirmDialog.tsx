"use client";

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export default function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
  confirmText = "تأیید",
  cancelText = "انصراف",
  danger = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" style={{ zIndex: 200 }}>
      <div className="modal-content max-w-sm">
        <p className="text-white text-center mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="btn btn-secondary flex-1"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`btn flex-1 ${danger ? "btn-danger" : "btn-primary"}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
