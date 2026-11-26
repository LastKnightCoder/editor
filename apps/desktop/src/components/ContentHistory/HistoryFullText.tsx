import { Drawer } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import type { DocumentHistoryPreview } from "@tau/collaboration";
import type { Descendant } from "slate";
import { useHistoryI18n } from "./i18n";

/** 「该版本全文」浏览：模态抽屉内只读渲染历史快照，不进写路径 */
export function HistoryFullText({
  preview,
  onClose,
}: {
  preview: DocumentHistoryPreview | undefined;
  onClose: () => void;
}) {
  const { t, locale } = useHistoryI18n();
  return (
    <Drawer
      open={Boolean(preview)}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      size="lg"
      title={preview ? t("drawer.actor", { actor: preview.entry.actorName }) : t("drawer.title")}
      subtitle={
        preview
          ? `#${preview.entry.sequence} · ${new Date(preview.entry.time).toLocaleString(locale)}`
          : undefined
      }
      label={t("drawer.title")}
      fill
    >
      {preview && (
        <div className="edge-fade-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[640px] px-8 py-8">
            {preview.value.title && (
              <h3 className="text-tau-heading mb-4">{preview.value.title}</h3>
            )}
            <ContentEditor
              readonly
              initValue={preview.value.content as Descendant[]}
              contracts={preview.contracts}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
