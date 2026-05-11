import { useEffect } from "react";

export default function Modal({ open, onClose, title, children, width = "max-w-lg" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`w-full ${width} rounded-lg bg-white shadow-xl`} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
