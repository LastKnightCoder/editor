import React from "react";
import { Descendant } from "slate";
import classnames from "classnames";
import { Editor, IExtension } from "@tau/editor/src";
import CustomModal from "@/components/CustomModal";
import styles from "./index.module.less";

interface NewAnswerModalProps {
  visible: boolean;
  defaultContent: Descendant[];
  extensions: IExtension[];
  onCancel: () => void;
  onOk: () => void;
  onChange: (value: Descendant[]) => void;
  customTitle?: string;
}

const NewAnswerModal: React.FC<NewAnswerModalProps> = ({
  visible,
  defaultContent,
  extensions,
  onCancel,
  onOk,
  onChange,
  customTitle = "新建答案",
}) => {
  const icon = (
    <svg
      className="w-5 h-5 text-emerald-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );

  const footer = (
    <div className="flex justify-end gap-3">
      <button
        onClick={onCancel}
        className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
      >
        取消
      </button>
      <button
        onClick={onOk}
        className="px-5 py-2.5 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-emerald-600 hover:-translate-y-px active:translate-y-0"
      >
        确定
      </button>
    </div>
  );

  return (
    <CustomModal
      open={visible}
      onCancel={onCancel}
      width={800}
      title={customTitle}
      subtitle="创建新的答案内容"
      icon={icon}
      iconBgColor="bg-emerald-50 dark:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/30"
      footer={footer}
      closeOnEscape={false}
    >
      <div className={classnames(styles.newAnswerEditor)}>
        <Editor
          initValue={defaultContent}
          onChange={onChange}
          readonly={false}
          extensions={extensions}
          style={{ maxHeight: 600, overflow: "auto", padding: 20 }}
        />
      </div>
    </CustomModal>
  );
};

export default NewAnswerModal;
