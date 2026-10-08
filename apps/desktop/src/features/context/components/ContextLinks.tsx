/**
 * 脉络「连接」分区（KL-018 的泛化）：显式 content_links ∪ 正文内联引用，合并去重。
 * 连接绑定 contentId——卡片、文章、项目文档、日记共用正文的身份共享同一组连接；
 * 添加走通用内容选择器（四种实体互连），解除直接删边（无向边单行，原子双边）。
 */

import { useState } from "react";
import { Link2, Plus, TextQuote, X } from "lucide-react";
import { toast } from "@tau/ui";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import type { EntityRef } from "@/entity/ref";
import { entityRefKey } from "@/entity/ref";
import type { SearchResult } from "@/types/search";
import type { ContextLink } from "@/types/entity-context";
import { useAddContentLink, useRemoveContentLink } from "../queries";
import { ENTITY_KIND_META } from "../model";
import { ContextRow, ContextSection } from "./ContextList";

const KIND_BY_TYPE: Partial<Record<SearchResult["type"], EntityRef["kind"]>> = {
  card: "card",
  article: "article",
  "project-item": "project-item",
  "diary-daily": "diary",
};

export interface AddContentLinkDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** 连接发起方 */
  from: EntityRef;
  /** 选择器排除的正文（自身与已连目标） */
  excludeContentIds: number[];
}

/** 添加连接弹窗：四种内容实体互连，选中即连（连接绑定正文，原子双边） */
export function AddContentLinkDialog({
  open,
  onOpenChange,
  from,
  excludeContentIds,
}: AddContentLinkDialogProps) {
  const addLink = useAddContentLink();
  return (
    <ContentSelectorModal
      open={open}
      onCancel={() => onOpenChange(false)}
      onSelect={item => {
        const picked = Array.isArray(item) ? item[0] : item;
        onOpenChange(false);
        const kind = picked && KIND_BY_TYPE[picked.type];
        if (!kind || !picked) return;
        addLink.mutate(
          { from, to: { kind, id: picked.id } },
          {
            onSuccess: linked => {
              if (!linked) toast.info("已连接或同一正文，无需重复连接");
            },
            onError: error => toast.error(error instanceof Error ? error.message : "添加连接失败"),
          }
        );
      }}
      contentType={["card", "article", "project-item", "diary-daily"]}
      excludeContentIds={excludeContentIds}
      title="添加连接"
      subtitle="连接绑定正文：卡片、文章、项目文档与日记之间可互连"
    />
  );
}

export interface ContextLinksSectionProps {
  self: EntityRef;
  links: ContextLink[];
  /** 自身（含共用正文身份）的正文，选择器排除 */
  selfContentIds: number[];
  onOpenEntity(ref: EntityRef): void;
  /** 分区内的导航先关浮层 */
  close(): void;
  /** 选择器弹窗开合上报：宿主浮层在弹窗期间锁定，避免外点误关（弹窗挂在 body，不算浮层内点） */
  onDialogOpenChange?(open: boolean): void;
}

export function ContextLinksSection({
  self,
  links,
  selfContentIds,
  onOpenEntity,
  close,
  onDialogOpenChange,
}: ContextLinksSectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const removeLink = useRemoveContentLink();
  const setDialogOpen = (open: boolean) => {
    setAddOpen(open);
    onDialogOpenChange?.(open);
  };

  const linkedContentIds = [
    ...selfContentIds,
    ...links
      .filter(link => !link.inlineOnly && link.contentId != null)
      .map(link => link.contentId!),
  ];

  return (
    <ContextSection title="连接">
      {links.map(({ entity, inlineOnly }) => {
        const { icon: KindIcon, label } = ENTITY_KIND_META[entity.ref.kind];
        const isCard = entity.ref.kind === "card";
        const LinkIcon = inlineOnly ? TextQuote : Link2;
        return (
          <ContextRow
            key={entityRefKey(entity.ref)}
            onClick={() => {
              close();
              onOpenEntity(entity.ref);
            }}
            action={
              inlineOnly ? undefined : (
                <button
                  type="button"
                  aria-label="解除连接"
                  title="解除连接"
                  onClick={() =>
                    removeLink.mutate(
                      { from: self, to: entity.ref },
                      {
                        onError: error =>
                          toast.error(error instanceof Error ? error.message : "解除连接失败"),
                      }
                    )
                  }
                  className="text-ink-3 hover:bg-danger-soft hover:text-danger rounded-tau-sm grid size-[22px] place-items-center"
                >
                  <X className="size-[12px]" strokeWidth={1.75} />
                </button>
              )
            }
          >
            <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
              <KindIcon className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
              <span className="text-ink-1 min-w-0 truncate">{entity.title}</span>
              {!isCard && <span className="text-ink-3 shrink-0 text-[12px]">{label}</span>}
              <LinkIcon
                className="text-ink-3 size-3 shrink-0"
                strokeWidth={1.75}
                aria-label={inlineOnly ? "正文内联引用" : "显式连接"}
              />
            </span>
          </ContextRow>
        );
      })}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="text-ink-3 hover:bg-hover hover:text-ink-2 rounded-tau-sm flex w-full items-center gap-1.5 px-2.5 py-[7px] text-[13px] transition-colors"
      >
        <Plus className="size-[13px]" strokeWidth={1.75} />
        添加连接
      </button>
      <AddContentLinkDialog
        open={addOpen}
        onOpenChange={setDialogOpen}
        from={self}
        excludeContentIds={linkedContentIds}
      />
    </ContextSection>
  );
}
