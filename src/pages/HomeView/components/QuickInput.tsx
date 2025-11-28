import React, { useState, useRef } from "react";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { FaAngleDown } from "react-icons/fa";
import Editor, { EditorRef } from "@/components/Editor";
import SelectDropDown from "@/components/SelectDropDown";
import { createCard } from "@/commands/card";
import {
  getDiaryEntryByDate,
  createDiaryEntry,
  updateDiaryEntry,
} from "@/commands/diary";
import { ECardCategory } from "@/types/card";
import { DivideLineElement } from "@/components/Editor/types/element/divide-line";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";

type InputMode = "note" | "diary";

interface ModeOption {
  key: InputMode;
  label: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { key: "note", label: "闪念笔记" },
  { key: "diary", label: "日记" },
];

const QuickInput: React.FC = () => {
  const [mode, setMode] = useState<InputMode>("note");
  const [editorValue, setEditorValue] =
    useState<Descendant[]>(DEFAULT_CARD_CONTENT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const modeTriggerRef = useRef<HTMLDivElement>(null);

  const placeHolder =
    mode === "note" ? "快速记录你的想法..." : "记录今天发生的事情...";

  const showMessage = (message: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  const handleCreateNote = useMemoizedFn(async () => {
    try {
      await createCard({
        content: editorValue,
        category: ECardCategory.Temporary,
        tags: [],
        links: [],
        count: 0,
        isTop: false,
      });
      showMessage("闪念笔记创建成功！", "success");
      // 清空输入框
      editorRef.current?.setEditorValue(DEFAULT_CARD_CONTENT);
    } catch (error) {
      console.error("创建闪念笔记失败:", error);
      showMessage("创建失败，请稍后重试", "error");
    }
  });

  const handleCreateDiary = useMemoizedFn(async () => {
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const existingDiary = await getDiaryEntryByDate(dateStr);

      if (existingDiary) {
        // 日记已存在，追加内容
        const divider: DivideLineElement = {
          type: "divide-line",
          children: [{ type: "formatted", text: "" }],
        };

        const updatedContent = [
          ...existingDiary.content,
          divider,
          ...editorValue,
        ];

        await updateDiaryEntry({
          id: existingDiary.id,
          content: updatedContent,
        });
        showMessage("日记更新成功！", "success");
      } else {
        // 创建新日记
        await createDiaryEntry({
          type: "daily",
          date: dateStr,
          content: editorValue,
          weather: null,
          mood: null,
        });
        showMessage("日记创建成功！", "success");
      }

      // 清空输入框
      editorRef.current?.setEditorValue(DEFAULT_CARD_CONTENT);
    } catch (error) {
      console.error("创建/更新日记失败:", error);
      showMessage("操作失败，请稍后重试", "error");
    }
  });

  const handleSubmit = useMemoizedFn(async () => {
    // 检查内容是否为空
    const firstNode = editorValue[0] as any;
    const isEmpty =
      editorValue.length === 1 &&
      firstNode.children?.length === 1 &&
      firstNode.children[0].text === "";

    if (isEmpty) {
      showMessage("请输入内容", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "note") {
        await handleCreateNote();
      } else {
        await handleCreateDiary();
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="w-full">
      {/* 成功提示 */}
      {successMessage && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm animate-fade-in">
          {successMessage}
        </div>
      )}

      {/* 错误提示 */}
      {errorMessage && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm animate-fade-in">
          {errorMessage}
        </div>
      )}

      {/* 输入框容器 */}
      <div className="rounded-xl border transition-all bg-white/60 dark:bg-[rgba(30,30,30,0.6)] backdrop-blur-md backdrop-saturate-150 border-white/30 dark:border-white/20 shadow-[0_4px_16px_0_rgba(31,38,135,0.08)] dark:shadow-[0_4px_16px_0_rgba(0,0,0,0.25)] focus-within:border-indigo-500/50 focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]">
        {/* Editor */}
        <div className="p-4 min-h-[180px]">
          <Editor
            ref={editorRef}
            initValue={editorValue}
            onChange={(value) => setEditorValue(value)}
            placeHolder={placeHolder}
            readonly={false}
            className="min-h-[140px] p-5"
          />
        </div>

        {/* 底部控制栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/20 dark:border-white/10">
          {/* 左侧：模式切换 */}
          <div
            ref={modeTriggerRef}
            onClick={() => setShowModeDropdown(!showModeDropdown)}
            className="relative py-2 pl-3 pr-8 rounded-lg text-sm cursor-pointer transition-all bg-white/60 dark:bg-[rgba(30,30,30,0.6)] backdrop-blur-md backdrop-saturate-150 border border-white/30 dark:border-white/20 text-gray-800 dark:text-white shadow-[0_2px_8px_0_rgba(31,38,135,0.1)] dark:shadow-[0_2px_8px_0_rgba(0,0,0,0.3)] hover:bg-white/70 dark:hover:bg-[rgba(30,30,30,0.7)]"
          >
            {MODE_OPTIONS.find((opt) => opt.key === mode)?.label}
            <FaAngleDown className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400" />
          </div>

          <SelectDropDown
            items={MODE_OPTIONS}
            selectedKey={mode}
            show={showModeDropdown}
            onClose={() => setShowModeDropdown(false)}
            onSelect={(option) => setMode(option.key)}
            triggerElement={modeTriggerRef.current}
            getKey={(option) => option.key}
            renderItem={(option) => option.label}
            width={120}
            maxHeight={200}
          />

          {/* 右侧：确定按钮 */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-lg border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-indigo-500 text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)] hover:bg-indigo-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                提交中...
              </>
            ) : (
              "确定"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickInput;
