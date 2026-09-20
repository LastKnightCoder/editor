import { useState } from "react";
import { Descendant } from "slate";
import { Trash2 } from "lucide-react";
import { Input } from "@tau/ui";
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
    <div className="flex flex-col gap-2">
      {/* 头行：类型切换药丸 + 删除 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {(["content", "custom"] as const).map(refType => (
            <button
              key={refType}
              type="button"
              aria-pressed={reference.refType === refType}
              onClick={() => handleTypeChange(refType)}
              className={`text-tau-sm ease-tau-out rounded-full px-3 py-1 font-medium transition-colors ${
                reference.refType === refType
                  ? "bg-accent-soft text-accent-text"
                  : "text-ink-3 hover:bg-hover hover:text-ink-2"
              }`}
            >
              {refType === "content" ? "引用内容" : "自定义内容"}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="删除此参考"
          onClick={onRemove}
          className="text-ink-3 hover:text-danger hover:bg-danger-soft rounded-tau-sm grid size-7 place-items-center transition-colors"
        >
          <Trash2 className="size-[14px]" strokeWidth={1.75} />
        </button>
      </div>

      <Input
        type="text"
        value={reference.title}
        onChange={e => handleTitleChange(e.target.value)}
        placeholder="参考资料标题"
      />

      {/* 内容区域 */}
      {reference.refType === "content" ? (
        <div>
          {reference.contentId ? (
            <div className="border-line-1 rounded-tau-sm flex items-center justify-between gap-2 border px-3 py-2">
              <span className="text-ink-2 text-tau-body min-w-0 truncate">
                已选择：{reference.title || "未命名内容"}
              </span>
              <button
                type="button"
                onClick={() => setShowContentSelector(true)}
                className="text-accent hover:text-accent-hover text-tau-sm shrink-0 transition-colors"
              >
                重新选择
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowContentSelector(true)}
              className="border-line-2 text-ink-3 hover:bg-hover hover:text-ink-2 rounded-tau-md text-tau-body w-full border border-dashed py-2.5 transition-colors"
            >
              点击选择内容
            </button>
          )}
        </div>
      ) : (
        <RichTextEditor
          value={reference.customContent || []}
          onChange={handleCustomContentChange}
          allowBlanks={false}
          isDark={isDark}
          placeholder="输入自定义参考资料内容..."
          minHeight="100px"
        />
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
