/**
 * 点地图节点（或洞见气泡里的笔记）后的预览：非模态 Drawer 叠在地图右侧，只读看正文，不离开地图；
 * 带块位置时滚到那一节并标出。要编辑或看全貌再点「打开」进对应详情（带着位置）。
 * 再点别的节点原地换内容，Esc / × 关闭。
 */

import { ExternalLink, FileText, FolderKanban, Layers } from "lucide-react";
import { Button, Drawer, useRetainedValue } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import { ErrorBoundary } from "@tau/ui";
import { serializeEntityLocation } from "@/entity/locate";
import type { KnowledgeMapItem } from "@/knowledge-map/types";
import { useOverlayDismiss } from "@/page/PageProvider";
import { type MapItemKind } from "../model";

import { useKnowledgeMapI18n, mapKindLabel } from "../i18n";

const KIND_ICON: Record<MapItemKind, typeof Layers> = {
  card: Layers,
  article: FileText,
  "project-item": FolderKanban,
};

export interface MapPreview {
  item: KnowledgeMapItem;
  /** 要定位的块（洞见里那一端所在的节）；节点直接点开的没有 */
  block?: number;
}

export function MapItemDrawer({
  preview,
  onClose,
  onOpen,
}: {
  preview: MapPreview | null;
  onClose(): void;
  onOpen(preview: MapPreview): void;
}) {
  const { t, locale } = useKnowledgeMapI18n();
  const open = preview !== null;
  useOverlayDismiss(onClose, open);
  const retained = useRetainedValue(preview);
  const current = retained?.item;
  const Icon = current ? KIND_ICON[current.kind] : Layers;
  const subtitle = current
    ? [
        mapKindLabel(current.kind, t),
        current.projectTitle,
        new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
          current.createdAt
        ),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Drawer
      modal={false}
      open={open}
      onOpenChange={next => !next && onClose()}
      size="md"
      label={t("map.preview")}
      icon={<Icon className="text-ink-3 mt-[5px] size-[15px]" strokeWidth={1.75} />}
      title={current?.title || t("map.untitled")}
      subtitle={subtitle}
      meta={
        current?.tags.length ? (
          <span className="text-ink-3 flex flex-wrap gap-1.5">
            {current.tags.map(tag => (
              <span key={tag}>#{tag}</span>
            ))}
          </span>
        ) : undefined
      }
      actions={
        retained && (
          <Button size="sm" variant="primary" icon={ExternalLink} onClick={() => onOpen(retained)}>
            {t("map.open")}
          </Button>
        )
      }
      className="z-30"
      bodyClassName="text-tau-body"
    >
      {current && (
        <ErrorBoundary>
          <ContentEditor
            key={current.contentId}
            contentId={current.contentId}
            at={
              retained?.block === undefined
                ? undefined
                : serializeEntityLocation({ block: retained.block })
            }
            readonly
          />
        </ErrorBoundary>
      )}
    </Drawer>
  );
}
