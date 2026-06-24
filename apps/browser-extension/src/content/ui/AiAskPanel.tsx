import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useInlineAiChat } from "../hooks/useInlineAiChat";

interface AiAskPanelProps {
  visible: boolean;
  selectedText: string;
  surroundingContext: string;
  pageUrl: string;
  onClose: () => void;
}

export default function AiAskPanel({
  visible,
  selectedText,
  surroundingContext,
  pageUrl,
  onClose,
}: AiAskPanelProps) {
  const [question, setQuestion] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  const {
    response,
    isLoading,
    error,
    isConnected,
    sendQuestion,
    stopGeneration,
    reset,
  } = useInlineAiChat({
    active: visible,
    selectedText,
    surroundingContext,
    pageUrl,
  });

  // 面板打开时聚焦输入框
  useEffect(() => {
    if (visible) {
      reset();
      setQuestion("");
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [visible, reset]);

  // 流式响应时自动滚动到底部
  useEffect(() => {
    if (response && responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  const handleSubmit = useCallback(() => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;
    sendQuestion(trimmed);
  }, [question, isLoading, sendQuestion]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        if (isLoading) {
          stopGeneration();
        } else {
          onClose();
        }
      }
    },
    [handleSubmit, isLoading, stopGeneration, onClose],
  );

  if (!visible) return null;

  // 截取选中文字的预览（过长时截断）
  const previewText =
    selectedText.length > 120
      ? selectedText.slice(0, 120) + "..."
      : selectedText;

  return (
    <div className="tau-ai-panel" onMouseDown={(e) => e.stopPropagation()}>
      {/* 顶栏：标题 + 关闭按钮 */}
      <header className="tau-ai-panel-header">
        <div className="tau-ai-panel-title">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>问 AI</span>
        </div>
        <button
          className="tau-ai-panel-close"
          onClick={onClose}
          title="关闭"
          aria-label="关闭"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      {/* 选中文字预览：引用块样式 */}
      <div className="tau-ai-panel-quote">
        <svg
          className="tau-ai-panel-quote-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
        </svg>
        <span className="tau-ai-panel-quote-text">{previewText}</span>
      </div>

      {/* 连接状态/错误提示 */}
      {!isConnected && !isLoading && !response && (
        <div className="tau-ai-panel-connect">
          <div className="tau-ai-panel-status">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>未连接到 AI 服务</span>
          </div>
          <button
            className="tau-ai-panel-open-tau"
            onClick={() => window.open("tau://", "_blank")}
          >
            打开 Tau
          </button>
        </div>
      )}

      {error && (
        <div className="tau-ai-panel-error">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* AI 响应区域（中间，可滚动） */}
      <div className="tau-ai-panel-body" ref={responseRef}>
        {response ? (
          <div className="tau-ai-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {response}
            </ReactMarkdown>
          </div>
        ) : (
          isLoading && (
            <div className="tau-ai-panel-loading">
              <span className="tau-ai-panel-loading-dot" />
              <span className="tau-ai-panel-loading-dot" />
              <span className="tau-ai-panel-loading-dot" />
            </div>
          )
        )}
      </div>

      {/* 底栏：输入框 + 发送按钮（整合成胶囊） */}
      <footer className="tau-ai-panel-footer">
        <div className="tau-ai-panel-composer">
          <textarea
            ref={textareaRef}
            className="tau-ai-panel-input"
            placeholder="关于这段文字，你想问什么？"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              className="tau-ai-panel-stop"
              onClick={stopGeneration}
              title="停止生成"
              aria-label="停止生成"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              className="tau-ai-panel-send"
              onClick={handleSubmit}
              disabled={!question.trim() || !isConnected}
              title="发送"
              aria-label="发送"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
