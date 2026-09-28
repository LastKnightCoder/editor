import { memo } from "react";
import { getDesktopKit } from "@/services/editorKit";
import { Descendant } from "slate";
import { Dialog, DialogBody } from "@tau/ui";
import { FileText } from "lucide-react";
import { Editor } from "@tau/editor/src";
import { formatDate, getContentLength } from "@/utils";

interface ContentPreviewModalProps {
  open: boolean;
  title: string;
  content: Descendant[];
  contentKey?: string | number; // key for forcing Editor refresh
  onClose: () => void;
  meta?: {
    category?: string;
    updateTime?: number;
    createTime?: number;
  };
  icon?: React.ReactNode;
}

export const ContentPreviewModal = memo<ContentPreviewModalProps>(
  ({ open, title, content, contentKey, onClose, meta, icon }) => {
    return (
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!next) onClose();
        }}
        title={title}
        icon={icon || <FileText size={16} strokeWidth={1.75} />}
        width={800}
      >
        <DialogBody>
          <div className="flex flex-col" style={{ height: "60vh", maxHeight: "60vh" }}>
            {meta && (
              <div className="border-line-2 text-ink-3 mb-4 flex items-center gap-3 border-b pb-3 text-[11.5px]">
                {meta.category && (
                  <span className="bg-hover text-ink-2 rounded-full px-2 py-0.5">
                    {meta.category}
                  </span>
                )}
                {meta.createTime && <span>创建于 {formatDate(meta.createTime, true)}</span>}
                {meta.updateTime && <span>更新于 {formatDate(meta.updateTime, true)}</span>}
                {content && <span>字数：{getContentLength(content)}</span>}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <Editor
                kit={getDesktopKit()}
                key={contentKey}
                initValue={content}
                readonly
                className="text-ink-1"
                style={{ padding: "0 4px" }}
              />
            </div>
          </div>
        </DialogBody>
      </Dialog>
    );
  }
);

ContentPreviewModal.displayName = "ContentPreviewModal";
