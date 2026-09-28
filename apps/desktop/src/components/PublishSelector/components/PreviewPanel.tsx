import { memo } from "react";
import { Eye } from "lucide-react";
import { Editor } from "@tau/editor/src";
import { getDesktopBareKit } from "@/services/editorKit";
import { Descendant } from "slate";

interface PreviewPanelProps {
  title?: string;
  content?: Descendant[];
  emptyText?: string;
  meta?: React.ReactNode;
}

export const PreviewPanel = memo<PreviewPanelProps>(
  ({ title, content, emptyText = "选择项目查看预览", meta }) => {
    if (!content || content.length === 0) {
      return (
        <div className="border-line-1 text-ink-3 rounded-tau-md flex h-full flex-col items-center justify-center border border-dashed p-6">
          <Eye size={40} strokeWidth={1.25} className="mb-3" />
          <p className="text-tau-meta">{emptyText}</p>
        </div>
      );
    }

    return (
      <div className="border-line-1 rounded-tau-md flex h-full flex-col overflow-hidden border">
        {title && (
          <div className="border-line-2 border-b px-4 py-3">
            <h4 className="text-tau-body text-ink-1 truncate font-semibold">{title}</h4>
            {meta && <div className="text-tau-tiny text-ink-3 mt-1">{meta}</div>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {/* 发布预览要与 blog 输出一致：裸 kit，不带任何宿主块扩展 */}
          <Editor
            kit={getDesktopBareKit()}
            initValue={content}
            readonly
            className="text-tau-body text-ink-1"
            style={{ minHeight: 200 }}
          />
        </div>
      </div>
    );
  }
);

PreviewPanel.displayName = "PreviewPanel";
