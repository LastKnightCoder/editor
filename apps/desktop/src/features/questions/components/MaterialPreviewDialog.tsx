/**
 * 材料预览：点材料行在弹窗里只读看正文，不离开问题页；要编辑或看全貌再「打开」进对应页面。
 * 仅卡片 / 文章 / 项目文档（背后有 content）可预览，项目与白板仍直接打开。
 */

import { ExternalLink } from "lucide-react";
import { Button, Dialog } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import type { QuestionMaterial } from "@/types";
import { TARGET_META, materialMeta, relativeDay } from "../model";

export function MaterialPreviewDialog({
  material,
  now,
  onClose,
  onOpen,
}: {
  material: QuestionMaterial | null;
  now: number;
  onClose(): void;
  onOpen(material: QuestionMaterial): void;
}) {
  const label = material ? TARGET_META[material.targetType].label : "";
  const info = material
    ? [materialMeta(material), relativeDay(material.targetCreateTime, now)]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Dialog
      open={material !== null}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title={material?.title ?? ""}
      context={label}
      width={760}
      fill
      footer={
        material && (
          <>
            <span className="text-ink-3 mr-auto text-[12px]">{info}</span>
            <Button
              variant="primary"
              size="sm"
              icon={ExternalLink}
              onClick={() => {
                onClose();
                onOpen(material);
              }}
            >
              打开{label}
            </Button>
          </>
        )
      }
    >
      {material?.contentId != null && (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ErrorBoundary>
            <ContentEditor
              key={material.contentId}
              contentId={material.contentId}
              readonly
              className="text-tau-body"
            />
          </ErrorBoundary>
        </div>
      )}
    </Dialog>
  );
}
