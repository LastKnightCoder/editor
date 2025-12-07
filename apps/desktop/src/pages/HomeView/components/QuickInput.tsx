import React, { useState, useRef } from "react";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { FaAngleDown } from "react-icons/fa";
import classNames from "classnames";
import { Editor, EditorRef } from "@tau/editor/src";
import SelectDropDown from "@/components/SelectDropDown";
import { createCard } from "@/commands/card";
import useThemeColors from "@/hooks/useThemeColors";
import {
  getDiaryEntryByDate,
  createDiaryEntry,
  updateDiaryEntry,
} from "@/commands/diary";
import { ECardCategory } from "@/types/card";
import { DivideLineElement } from "@tau/editor/src";
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
  const themeColors = useThemeColors();
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
      <div
        className={classNames(
          "rounded-2xl border transition-all backdrop-blur-xl backdrop-saturate-150 shadow-md",
          themeColors.glassPanelBg,
          themeColors.cardBorderClass,
        )}
      >
        <div className="p-5 min-h-[120px]">
          <Editor
            ref={editorRef}
            initValue={editorValue}
            onChange={(value) => setEditorValue(value)}
            placeHolder={placeHolder}
            readonly={false}
            className="min-h-[140px] p-2"
          />
        </div>

        <div
          className={classNames(
            "flex items-center justify-between px-5 py-4 border-t",
            themeColors.cardBorderClass,
          )}
        >
          <div
            ref={modeTriggerRef}
            onClick={() => setShowModeDropdown(!showModeDropdown)}
            className={classNames(
              "relative py-2 pl-3 pr-8 rounded-lg text-sm cursor-pointer transition-all",
              themeColors.textClass,
              themeColors.hoverClass,
            )}
          >
            {MODE_OPTIONS.find((opt) => opt.key === mode)?.label}
            <FaAngleDown
              className={classNames(
                "absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-60",
              )}
            />
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

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={classNames(
              "px-6 py-2 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
              themeColors.buttonBg,
              themeColors.buttonTextClass,
            )}
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
