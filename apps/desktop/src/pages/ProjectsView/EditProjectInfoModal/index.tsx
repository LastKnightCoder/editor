import { Descendant } from "slate";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import { MdClose } from "react-icons/md";
import {
  FileTextOutlined,
  TableOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";

import EditText from "@/components/EditText";
import { Editor } from "@tau/editor/src";
import { EProjectType } from "@/types";

interface EditProjectInfoModalProps {
  open: boolean;
  title: string;
  desc: Descendant[];
  defaultProjectType?: EProjectType;
  onOk?: (
    title: string,
    desc: Descendant[],
    projectType: EProjectType,
  ) => Promise<void>;
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
    defaultProjectType ?? EProjectType.DocumentTree,
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
        className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-[520px] m-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-zinc-900/95 border border-gray-200 dark:border-slate-800 flex flex-col">
            {/* Header */}
            <div className="flex items-start gap-3 mb-5">
              <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30">
                <svg
                  className="w-5 h-5 text-indigo-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                  新建项目
                </h2>
                <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                  创建一个新的项目空间
                </p>
              </div>
              <button
                onClick={onCancel}
                className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-slate-200"
              >
                <MdClose className="w-5 h-5" />
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
                    border: "1px solid var(--border-color, #e5e7eb)",
                    background: "var(--bg-secondary, #f9fafb)",
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
                  {PROJECT_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setProjectType(option.value)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                        projectType === option.value
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
                          : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-zinc-950 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-100 dark:hover:bg-zinc-900"
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
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-zinc-950 p-3 min-h-[80px]">
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
            <div className="flex justify-end items-center gap-2 pt-4 mt-4 border-t border-gray-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleOk}
                className="px-5 py-3 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-indigo-500 text-white shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-indigo-600 hover:-translate-y-px active:translate-y-0"
              >
                确定
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

export default EditProjectInfoModal;
