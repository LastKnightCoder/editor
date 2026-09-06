import { useState } from "react";
import { Descendant } from "slate";
import { FlashcardReferenceInput } from "@/types/flashcard";
import { SearchResult } from "@/types/search";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import RichTextEditor from "../RichTextEditor";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";

interface ReferenceEditorProps {
  reference: FlashcardReferenceInput;
  onChange: (reference: FlashcardReferenceInput) => void;
  onRemove: () => void;
  isDark: boolean;
}

const ReferenceEditor = ({ reference, onChange, onRemove, isDark }: ReferenceEditorProps) => {
  const [showContentSelector, setShowContentSelector] = useState(false);
  const extensions = useDynamicExtensions();

  const handleTypeChange = (newType: "content" | "custom") => {
    if (newType === reference.refType) return;

    // 切换类型时重置数据
    if (newType === "content") {
      onChange({
        refType: "content",
        title: "",
        contentId: undefined,
        customContent: undefined,
      });
    } else {
      onChange({
        refType: "custom",
        title: "",
        contentId: undefined,
        customContent: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
      });
    }
  };

  const handleContentSelect = (item: SearchResult) => {
    onChange({
      refType: "content",
      contentId: item.contentId,
      title: item.title,
      customContent: undefined,
    });
    setShowContentSelector(false);
  };

  const handleCustomContentChange = (content: Descendant[]) => {
    onChange({
      ...reference,
      customContent: content,
    });
  };

  const handleTitleChange = (newTitle: string) => {
    onChange({
      ...reference,
      title: newTitle,
    });
  };

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: isDark ? "rgba(148, 163, 184, 0.2)" : "#e5e7eb",
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.5)" : "#f9fafb",
      }}
    >
      {/* 类型选择 */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange("content")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              reference.refType === "content"
                ? isDark
                  ? "bg-[var(--th-accent)]/20 border-[var(--th-accent)]/50 border text-[var(--th-active-text)]"
                  : "border-[var(--th-border-focus)]/30 border bg-[var(--th-accent-soft)] text-[var(--th-active-text)]"
                : isDark
                  ? "border border-slate-700 bg-zinc-800 text-slate-400 hover:border-slate-600"
                  : "border border-gray-300 bg-white text-gray-600 hover:border-gray-400"
            }`}
          >
            引用内容
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange("custom")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              reference.refType === "custom"
                ? isDark
                  ? "bg-[var(--th-accent)]/20 border-[var(--th-accent)]/50 border text-[var(--th-active-text)]"
                  : "border-[var(--th-border-focus)]/30 border bg-[var(--th-accent-soft)] text-[var(--th-active-text)]"
                : isDark
                  ? "border border-slate-700 bg-zinc-800 text-slate-400 hover:border-slate-600"
                  : "border border-gray-300 bg-white text-gray-600 hover:border-gray-400"
            }`}
          >
            自定义内容
          </button>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded-lg border px-3 py-1.5 text-xs transition-all hover:border-red-400 dark:hover:border-red-500"
          style={{
            color: isDark ? "#ef4444" : "#dc2626",
            backgroundColor: isDark ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.05)",
            borderColor: isDark ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.1)",
          }}
        >
          删除
        </button>
      </div>

      {/* 标题输入 */}
      <div className="mb-3">
        <label
          className="mb-1.5 block text-xs font-medium"
          style={{ color: isDark ? "#94a3b8" : "#6b7280" }}
        >
          标题
        </label>
        <input
          type="text"
          value={reference.title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="输入参考资料标题"
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
          style={{
            borderColor: isDark ? "#475569" : "#d1d5db",
            backgroundColor: isDark ? "#1e293b" : "white",
            color: isDark ? "white" : "#1f2937",
          }}
        />
      </div>

      {/* 内容区域 */}
      {reference.refType === "content" ? (
        <div>
          {reference.contentId ? (
            <div
              className="rounded-lg border p-3 text-sm"
              style={{
                borderColor: isDark ? "#475569" : "#e5e7eb",
                backgroundColor: isDark ? "#0f172a" : "#f9fafb",
                color: isDark ? "#e2e8f0" : "#374151",
              }}
            >
              <div className="flex items-center justify-between">
                <span>已选择内容 ID: {reference.contentId}</span>
                <button
                  type="button"
                  onClick={() => setShowContentSelector(true)}
                  className="rounded px-2 py-1 text-xs"
                  style={{
                    color: isDark ? "#60a5fa" : "#3b82f6",
                  }}
                >
                  重新选择
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowContentSelector(true)}
              className="w-full rounded-lg border-2 border-dashed py-3 text-sm transition-colors"
              style={{
                borderColor: isDark ? "#475569" : "#d1d5db",
                color: isDark ? "#94a3b8" : "#6b7280",
              }}
            >
              点击选择内容
            </button>
          )}
        </div>
      ) : (
        <div>
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: isDark ? "#94a3b8" : "#6b7280" }}
          >
            自定义内容
          </label>
          <RichTextEditor
            value={reference.customContent || []}
            onChange={handleCustomContentChange}
            allowBlanks={false}
            isDark={isDark}
            placeholder="输入自定义参考资料内容..."
            minHeight="100px"
          />
        </div>
      )}

      {/* 内容选择器模态框 */}
      <ContentSelectorModal
        open={showContentSelector}
        onCancel={() => setShowContentSelector(false)}
        onSelect={item => {
          if (!Array.isArray(item)) {
            handleContentSelect(item);
          }
        }}
        contentType={["card", "article", "document-item", "project-item", "diary-daily"]}
        extensions={extensions}
        emptyDescription="无可用内容"
        showTitle={true}
        title="选择参考内容"
      />
    </div>
  );
};

export default ReferenceEditor;
