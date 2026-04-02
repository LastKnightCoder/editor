import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import { parseNotionBlockId } from "@/utils/notion";
import { getNotionBlockInfo } from "@/commands/notion";
import useSettingStore from "@/stores/useSettingStore";
import type { NotionVideoMetaInfo } from "@/types";
import "./index.css";

export interface NotionVideoSelectResult {
  metaInfo: NotionVideoMetaInfo;
  blockId: string;
}

interface NotionVideoSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: NotionVideoSelectResult) => void;
  initialInput?: string;
}

const NotionVideoSelectModal: React.FC<NotionVideoSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialInput = "",
}) => {
  const [input, setInput] = useState(initialInput);
  const [cacheEnabled, setCacheEnabled] = useState(false); // 默认不缓存
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { setting } = useSettingStore.getState();

  useEffect(() => {
    if (open) {
      setInput(initialInput);
      setCacheEnabled(false); // 默认不缓存
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialInput]);

  const handleSubmit = useMemoizedFn(async () => {
    if (!input.trim()) {
      setError("请输入 Notion 视频区块 ID 或链接");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const blockId = parseNotionBlockId(input);
      if (!blockId) {
        setError("无法解析 Block ID，请检查输入格式");
        return;
      }

      const token = setting.integration.notion.token;
      if (!token || !setting.integration.notion.enabled) {
        setError("请先在设置中配置 Notion 集成");
        return;
      }

      const blockInfo = await getNotionBlockInfo(token, blockId);
      if (!blockInfo.success) {
        setError(blockInfo.error || "获取 Notion 区块信息失败");
        return;
      }

      if (blockInfo.blockType !== "video") {
        setError(`该区块不是视频类型，而是 ${blockInfo.blockType} 类型`);
        return;
      }

      onConfirm({
        metaInfo: {
          type: "notion",
          blockId,
          cache: cacheEnabled,
        },
        blockId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败，请稍后重试");
    } finally {
      setIsAnalyzing(false);
    }
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="notion-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="notion-modal-container w-full max-w-[460px] m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-zinc-900/95 border border-gray-200 dark:border-slate-800">
          <div className="flex items-start gap-3 mb-5">
            <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-gray-50 dark:bg-zinc-700/50 border border-gray-200 dark:border-gray-600">
              <svg
                className="w-5 h-5 text-gray-900 dark:text-gray-100"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z" />
                <path d="M8 8h8v2H8V8zm0 4h8v2H8v-2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                添加 Notion 视频
              </h2>
              <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                输入视频区块 ID 或链接
              </p>
            </div>
            <button
              className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-slate-200"
              onClick={onCancel}
            >
              <svg
                className="w-[18px] h-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError(null);
                }}
                placeholder={`请输入 Notion 视频区块 ID 或链接，例如：\n- 3b628e1d-84da-4c6c-900d-b6e4a28532e1\n- https://www.notion.so/...#3b628e1d84da4c6c900db6e4a28532e1`}
                rows={6}
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-gray-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(107,114,128,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(107,114,128,0.25)] disabled:opacity-60 disabled:cursor-not-allowed resize-none"
                disabled={isAnalyzing}
              />
            </div>

            {/* Cache Toggle */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-gray-600 dark:text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  缓存视频到本地
                </span>
              </div>
              <button
                onClick={() => setCacheEnabled(!cacheEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  cacheEnabled
                    ? "bg-gray-600 dark:bg-gray-500"
                    : "bg-gray-300 dark:bg-zinc-700"
                }`}
                disabled={isAnalyzing}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    cacheEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {error && (
              <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-zinc-700 dark:bg-gray-600 text-white shadow-[0_4px_14px_rgba(55,65,81,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-zinc-800 dark:hover:bg-zinc-700 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
              onClick={handleSubmit}
              disabled={!input.trim() || isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <svg
                    className="notion-spin w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  正在验证...
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  确认添加
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default NotionVideoSelectModal;
