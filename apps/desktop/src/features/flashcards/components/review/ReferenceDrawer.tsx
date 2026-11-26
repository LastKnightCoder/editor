import { flashcardsTranslator, useFlashcardsI18n } from "../../i18n";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { FlashcardReference } from "@/types";
import { Drawer, useRetainedValue } from "@tau/ui";
import { FileText } from "lucide-react";
import { RichContent } from "../CardContent";

/** 复习时的参考资料（非模态 Drawer，盖住卡片区右侧；Esc 经页面浮层仲裁逐层关闭） */
export function ReferenceDrawer({
  reference,
  onClose,
}: {
  reference: FlashcardReference | null;
  onClose(): void;
}) {
  useFlashcardsI18n();
  const open = reference !== null;
  useOverlayDismiss(onClose, open);
  const current = useRetainedValue(reference);

  return (
    <Drawer
      modal={false}
      open={open}
      onOpenChange={next => !next && onClose()}
      size="sm"
      label={flashcardsTranslator.t("ui.references")}
      icon={<FileText className="text-ink-3 mt-[5px] size-[15px]" strokeWidth={1.75} />}
      title={current?.title || flashcardsTranslator.t("ui.untitledReference")}
      bodyClassName="text-[14px] leading-[1.75]"
    >
      {current?.content && <RichContent key={current.id} content={current.content.content} />}
    </Drawer>
  );
}
