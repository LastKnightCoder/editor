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
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-2xl mx-4 p-6 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto"
        style={{ width: Math.min(width, window.innerWidth - 32) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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

        <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onOk}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditModal;
