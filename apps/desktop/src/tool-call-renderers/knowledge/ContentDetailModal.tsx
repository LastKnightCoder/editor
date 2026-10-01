import { useEffect, useState } from "react";
import { Descendant } from "slate";
import { Dialog, DialogBody, Spinner } from "@tau/ui";
import Editor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getContentById } from "@/commands/content";

interface ContentDetailModalProps {
  contentId: number | undefined;
  title: string;
  typeName: string;
  visible: boolean;
  onClose: () => void;
}

const ContentDetailModal = ({
  contentId,
  title,
  typeName,
  visible,
  onClose,
}: ContentDetailModalProps) => {
  const [loading, setLoading] = useState(true);
  const [initValue, setInitValue] = useState<Descendant[] | null>(null);

  useEffect(() => {
    if (!visible || !contentId) {
      setLoading(true);
      setInitValue(null);
      return;
    }
    setLoading(true);
    getContentById(contentId).then(data => {
      setInitValue(data?.content ?? null);
      setLoading(false);
    });
  }, [visible, contentId]);

  return (
    <Dialog
      open={visible && !!contentId}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title={title}
      context={typeName || undefined}
      width={800}
    >
      <DialogBody>
        {loading || !initValue ? (
          <div className="text-ink-3 text-tau-meta flex h-48 items-center justify-center gap-2">
            <Spinner />
            加载中…
          </div>
        ) : (
          <div className="text-ink-1 min-h-50 pb-2">
            <ErrorBoundary>
              <Editor
                contentId={contentId}
                key={contentId}
                initValue={initValue}
                readonly={false}
              />
            </ErrorBoundary>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
};

export default ContentDetailModal;
