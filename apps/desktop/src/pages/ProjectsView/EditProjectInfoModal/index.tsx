import { Descendant } from "slate";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import { MdClose } from "react-icons/md";
import { FileTextOutlined, TableOutlined, ExperimentOutlined } from "@ant-design/icons";

import EditText from "@/components/EditText";
import { Editor } from "@tau/editor/src";
import { EProjectType } from "@/types";

interface EditProjectInfoModalProps {
  open: boolean;
  title: string;
  desc: Descendant[];
  defaultProjectType?: EProjectType;
  onOk?: (title: string, desc: Descendant[], projectType: EProjectType) => Promise<void>;
  onCancel?: () => void;
}

const PROJECT_TYPE_OPTIONS = [
  {
    value: EProjectType.DocumentTree,
    label: "文档树",
    description: "以文档树形式组织内容",
    icon: <FileTextOutlined />,
  },
  {
    value: EProjectType.DataTable,
    label: "数据表格",
    description: "使用表格管理结构化数据",
    icon: <TableOutlined />,
  },
  {
    value: EProjectType.VibeLearning,
    label: "Vibe Learning",
    description: "沉浸式学习项目",
    icon: <ExperimentOutlined />,
  },
];

const EditProjectInfoModal = (props: EditProjectInfoModalProps) => {
  const { open, title, desc, defaultProjectType, onOk, onCancel } = props;
  const [descValue, setDescValue] = useState(desc);
  const [titleValue, setTitleValue] = useState(title);
  const [projectType, setProjectType] = useState<EProjectType>(
    defaultProjectType ?? EProjectType.DocumentTree
  );

  useEffect(() => {
    if (open) {
      setTitleValue(title);
      setDescValue(desc);
      setProjectType(defaultProjectType ?? EProjectType.DocumentTree);
    }
  }, [open, defaultProjectType]);

  const handleOk = useMemoizedFn(async () => {
    await onOk?.(titleValue, descValue, projectType);
  });

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="m-4 w-full max-w-[520px]"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            {/* Header */}
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/20">
                <svg
                  className="h-5 w-5 text-indigo-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">新建项目</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                  创建一个新的项目空间
                </p>
              </div>
              <button
                onClick={onCancel}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  标题
                </label>
                <EditText
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    borderRadius: 12,
                    fontSize: 14,
                    border: "1px solid var(--th-border, #e5e7eb)",
                    background: "var(--th-bg-page, #f9fafb)",
                  }}
                  defaultValue={titleValue}
                  onChange={setTitleValue}
                  contentEditable={true}
                  defaultFocus
                />
              </div>

              {/* Project Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  类型
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PROJECT_TYPE_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setProjectType(option.value)}
                      className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                        projectType === option.value
                          ? "border-indigo-500 bg-indigo-50 shadow-[0_0_0_3px_rgba(99,102,241,0.15)] dark:bg-indigo-500/10"
                          : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 dark:border-slate-700 dark:bg-zinc-950 dark:hover:border-slate-600 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <span
                        className={`text-lg ${
                          projectType === option.value
                            ? "text-indigo-500"
                            : "text-gray-500 dark:text-slate-400"
                        }`}
                      >
                        {option.icon}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          projectType === option.value
                            ? "text-indigo-600 dark:text-indigo-400"
                            : "text-gray-600 dark:text-slate-300"
                        }`}
                      >
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  描述
                </label>
                <div className="min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-zinc-950">
                  <Editor
                    style={{ flex: "auto" }}
                    initValue={descValue}
                    onChange={setDescValue}
                    readonly={false}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={onCancel}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleOk}
                className="cursor-pointer rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3 text-sm font-semibold text-[var(--th-btn-text)] shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0"
              >
                确定
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default EditProjectInfoModal;
