import React from "react";

interface EditModalProps {
  open: boolean;
  title: string;
  onOk: () => void;
  onCancel: () => void;
  okText?: string;
  cancelText?: string;
  children: React.ReactNode;
  width?: number;
}

const EditModal: React.FC<EditModalProps> = ({
  open,
  title,
  onOk,
  onCancel,
  okText = "保存",
  cancelText = "取消",
  children,
  width = 800,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div
        className="relative mx-4 max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-zinc-900"
        style={{ width: Math.min(width, window.innerWidth - 32) }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button
            onClick={onCancel}
            className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="mb-6">{children}</div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
          >
            {cancelText}
          </button>
          <button
            onClick={onOk}
            className="rounded-lg bg-[var(--th-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--th-btn-text)] transition-colors hover:bg-[var(--th-btn-hover)]"
          >
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditModal;
