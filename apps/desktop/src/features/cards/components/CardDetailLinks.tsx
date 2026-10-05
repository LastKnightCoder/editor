/**
 * 卡片连接：脉络浮层里的「连接」分区（KL-018，原正文下方的连接区并入）+ 添加连接选卡浮层。
 *
 * 连接口径：双向链接 links ∪ 正文内联 content-link 对任何实体的引用（卡片、文章、项目文档、
 * 日记）合并去重，角标区分双向 / 仅内联；双向链接的建立与解除都是双边写（本卡与对方卡
 * 各提交一次元数据补丁，等价 legacy useEditCard 的 onAddLinks/onRemoveLink）。
 * 悬浮球式的图谱入口不做（图谱在卡片库列表页，2026-09-20 裁决）。
 */

import { useMemo, useState } from "react";
import { Link2, Plus, Search, TextQuote, X } from "lucide-react";
import type { ICard } from "@/types";
import { getInlineLinks } from "@/utils/card";
import { resultDisplay, useSearchContent } from "@/features/search/queries";
import { Dialog, DialogBody, useEdgeFade } from "@tau/ui";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ContextRow, ContextSection } from "@/features/context/components/ContextList";
import { ENTITY_KIND_META } from "@/features/context/model";
import { extractInlineRefs } from "@/entity/inline-refs";
import { entityRefKey, type EntityRef } from "@/entity/ref";
import { cardTitle } from "@/utils/card-title";

/** links ∪ 内联引用，去重并排除自身；返回 id 与「是否仅来自正文内联」 */
function mergedLinks(card: ICard): { id: number; inlineOnly: boolean }[] {
  const inline = new Set(getInlineLinks(card));
  const explicit = new Set(card.links);
  const merged = new Map<number, { id: number; inlineOnly: boolean }>();
  for (const id of explicit) merged.set(id, { id, inlineOnly: false });
  for (const id of inline) {
    if (!merged.has(id)) merged.set(id, { id, inlineOnly: true });
  }
  return [...merged.values()].filter(item => item.id !== card.id);
}

interface Connection {
  ref: EntityRef;
  /** 只来自正文引用（不是双向链接），不可在这里解除 */
  inlineOnly: boolean;
  /** 正文引用节点上的标题，非卡片目标用它展示 */
  label: string;
}

/** 连接：双向链接 ∪ 正文里对任何实体的内联引用，去重并排除自身 */
function connectionsOf(card: ICard): Connection[] {
  const merged = new Map<string, Connection>();
  for (const id of card.links) {
    if (id !== card.id)
      merged.set(`card:${id}`, { ref: { kind: "card", id }, inlineOnly: false, label: "" });
  }
  for (const { dst, snippet } of extractInlineRefs(card.content)) {
    if (dst.kind === "card" && dst.id === card.id) continue;
    const key = entityRefKey(dst);
    if (!merged.has(key)) merged.set(key, { ref: dst, inlineOnly: true, label: snippet.label });
  }
  return [...merged.values()];
}

/** 连接数，计入脉络入口的关联数 */
export const cardConnectionCount = (card: ICard) => connectionsOf(card).length;

export interface CardConnectionsProps {
  card: ICard;
  /** 轻表全集：标题解析（找不到的 id 视为已删除，退化为 #id 占位） */
  cards: ICard[];
  onNavigate(ref: EntityRef): void;
  onUnlink(targetId: number): void;
  onOpenAddDialog(): void;
}

/** 脉络浮层里的「连接」分区（KL-018）；没有连接时由调用方不渲染 */
export function CardConnections({
  card,
  cards,
  onNavigate,
  onUnlink,
  onOpenAddDialog,
}: CardConnectionsProps) {
  const linked = useMemo(
    () =>
      connectionsOf(card).map(connection => ({
        ...connection,
        target:
          connection.ref.kind === "card"
            ? (cards.find(item => item.id === connection.ref.id) ?? null)
            : null,
      })),
    [card, cards]
  );

  return (
    <ContextSection title="连接">
      {linked.map(({ ref, inlineOnly, label, target }) => {
        const isCard = ref.kind === "card";
        const title = isCard
          ? (target && cardTitle(target, 26)) || label || `卡片 #${ref.id}`
          : label || ENTITY_KIND_META[ref.kind].label;
        const LinkIcon = inlineOnly ? TextQuote : Link2;
        const KindIcon = ENTITY_KIND_META[ref.kind].icon;
        return (
          <ContextRow
            key={entityRefKey(ref)}
            onClick={() => onNavigate(ref)}
            action={
              inlineOnly ? undefined : (
                <button
                  type="button"
                  aria-label="解除链接"
                  title="解除链接（双边清理）"
                  onClick={() => onUnlink(ref.id)}
                  className="text-ink-3 hover:bg-danger-soft hover:text-danger rounded-tau-sm grid size-[22px] place-items-center"
                >
                  <X className="size-[12px]" strokeWidth={1.75} />
                </button>
              )
            }
          >
            <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
              {isCard ? (
                <span
                  className="bg-ink-3 size-[7px] shrink-0 rounded-full"
                  aria-hidden
                />
              ) : (
                <KindIcon className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
              )}
              <span className="text-ink-1 min-w-0 truncate">{title}</span>
              {!isCard && (
                <span className="text-ink-3 shrink-0 text-[12px]">
                  {ENTITY_KIND_META[ref.kind].label}
                </span>
              )}
              <LinkIcon
                className="text-ink-3 size-3 shrink-0"
                strokeWidth={1.75}
                aria-label={inlineOnly ? "正文内联引用" : "双向链接"}
              />
            </span>
          </ContextRow>
        );
      })}
      <button
        type="button"
        onClick={onOpenAddDialog}
        className="text-ink-3 hover:bg-hover hover:text-ink-2 rounded-tau-sm flex w-full items-center gap-1.5 px-2.5 py-[7px] text-[13px] transition-colors"
      >
        <Plus className="size-[13px]" strokeWidth={1.75} />
        添加连接
      </button>
    </ContextSection>
  );
}

export interface AddCardLinkDialogProps {
  open: boolean;
  card: ICard;
  cards: ICard[];
  onOpenChange(open: boolean): void;
  /** 选定即连（双边写由调用方承担），可多选连续连接 */
  onLink(targetIds: number[]): void;
}

interface CandidateRow {
  id: number;
  title: string;
}

export function AddCardLinkDialog({
  open,
  card,
  cards,
  onOpenChange,
  onLink,
}: AddCardLinkDialogProps) {
  const [query, setQuery] = useState("");
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(listEl);
  const debouncedQuery = useDebouncedValue(query, 250);
  const searching = debouncedQuery.trim().length > 0;

  /* 检索与 Ctrl+K 同管线（search 域查询函数，非 store；FTS + 向量多路召回，
     未配 embedding 自动只走 FTS） */
  const searchQuery = useSearchContent(searching ? debouncedQuery : "", ["card"]);

  const candidates = useMemo<{
    fetching: boolean;
    error: string | null;
    rows: CandidateRow[];
  }>(() => {
    const linked = new Set(mergedLinks(card).map(item => item.id));
    if (!searching) {
      /* 空输入 = 轻表全集默认候选 */
      return {
        fetching: false,
        error: null,
        rows: cards
          .filter(item => item.id !== card.id && !linked.has(item.id))
          .map(item => ({
            id: item.id,
            title: cardTitle(item, 26) || `卡片 #${item.id}`,
          })),
      };
    }
    const byId = new Map(cards.map(item => [item.id, item]));
    const seen = new Set<number>();
    const rows: CandidateRow[] = [];
    for (const result of searchQuery.data ?? []) {
      if (result.type !== "card" || seen.has(result.id)) continue;
      if (result.id === card.id || linked.has(result.id)) continue;
      const target = byId.get(result.id);
      if (!target) continue; // 索引脏数据 / 已删除卡
      seen.add(result.id);
      rows.push({ id: result.id, title: resultDisplay(result).title });
    }
    return {
      fetching: searchQuery.isFetching,
      error: searchQuery.error?.message ?? null,
      rows,
    };
  }, [
    searching,
    card.id,
    card,
    cards,
    searchQuery.data,
    searchQuery.isFetching,
    searchQuery.error,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="添加连接"
      width={460}
      onAfterClose={() => setQuery("")}
    >
      <DialogBody>
        <div className="flex flex-col gap-2">
          <label className="border-line-1 bg-surface rounded-tau-sm flex h-[34px] items-center gap-2 border px-3">
            <Search className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
            <input
              data-autofocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜索卡片（语义检索，同 Ctrl+K）…"
              aria-label="搜索卡片"
              className="text-tau-meta text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
            />
            {candidates.fetching && (
              <span className="text-ink-3 shrink-0 text-[11px]">搜索中…</span>
            )}
          </label>
          <div
            ref={setListEl}
            className="edge-fade-scroll flex max-h-[46vh] flex-col gap-0.5 overflow-y-auto pr-0.5"
          >
            {candidates.error && (
              <p className="text-danger py-6 text-center text-[12.5px]">
                搜索失败：{candidates.error}
              </p>
            )}
            {!candidates.error &&
              candidates.rows.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onLink([item.id]);
                    onOpenChange(false);
                  }}
                  className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-meta flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors"
                >
                  <span className="bg-ink-3 size-[7px] shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </button>
              ))}
            {!candidates.error && !candidates.fetching && candidates.rows.length === 0 && (
              <p className="text-ink-3 py-8 text-center text-[12.5px]">没有可连接的卡片</p>
            )}
            {!candidates.error && candidates.fetching && candidates.rows.length === 0 && (
              <p className="text-ink-3 py-8 text-center text-[12.5px]">搜索中…</p>
            )}
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
