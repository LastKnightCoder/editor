/**
 * 卡片详情连接区（v2：有关联才渲染，空卡不堆区块）+ 添加连接选卡浮层。
 *
 * 连接口径：显式 links ∪ 正文内联 content-link 引用（getInlineLinks）合并去重，
 * chip 角标区分双向 / 仅内联；双向链接的建立与解除都是双边写（本卡与对方卡
 * 各提交一次元数据补丁，等价 legacy useEditCard 的 onAddLinks/onRemoveLink）。
 * 悬浮球式的图谱入口不做（图谱在卡片库列表页，2026-09-20 裁决）。
 */

import { useMemo, useState } from "react";
import { Link2, Plus, Search, TextQuote, X } from "lucide-react";
import type { ICard } from "@/types";
import { getInlineLinks } from "@/utils/card";
import { getEditorText } from "@/utils/editor";
import { cardCategoryName } from "@/constants/card";
import { resultDisplay, useSearchContent } from "@/features/search/queries";
import { Dialog, DialogBody, useEdgeFade } from "@tau/ui";
import { CATEGORY_COLORS } from "../categoryColors";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

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

export interface CardDetailLinksProps {
  card: ICard;
  /** 轻表全集：chip 标题解析与添加候选（找不到的 id 视为已删除，跳过渲染） */
  cards: ICard[];
  onNavigate(cardId: number): void;
  onUnlink(targetId: number): void;
  onOpenAddDialog(): void;
}

export function CardDetailLinks({
  card,
  cards,
  onNavigate,
  onUnlink,
  onOpenAddDialog,
}: CardDetailLinksProps) {
  /* 是否渲染只看卡自身的 links ∪ 内联引用（detail 全量，可靠）；轻表未就绪时
     对方卡片解析为 null，chip 退化为 #id 占位，不因此误判成「无连接」 */
  const linked = useMemo(
    () =>
      mergedLinks(card).map(({ id, inlineOnly }) => ({
        id,
        inlineOnly,
        target: cards.find(item => item.id === id) ?? null,
      })),
    [card, cards]
  );

  if (linked.length === 0) return null;

  return (
    <section className="mt-[26px]">
      <div className="flex items-baseline gap-2 px-0.5 pb-2.5">
        <b className="text-tau-meta font-semibold">连接</b>
        <span className="font-tau-mono text-ink-3 text-[10px] uppercase tracking-[0.05em]">
          linked
        </span>
        <span className="text-tau-meta text-ink-3 tabular-nums">{linked.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {linked.map(({ target, id, inlineOnly }) => {
          const title = target ? getEditorText(target.content, 18) || `卡片 #${id}` : `卡片 #${id}`;
          const dotColor = target ? CATEGORY_COLORS[target.category].text : "var(--tau-ink-3)";
          return (
            /* chip = 跳转与解除两个并列按钮（键盘可分别 Tab 到达），容器承载整体 hover 视觉 */
            <div
              key={id}
              className="bg-hover hover:bg-press hover:text-ink-1 text-ink-2 ease-tau-out rounded-tau-sm group flex h-[30px] max-w-full items-center text-[12px] transition-colors"
            >
              <button
                type="button"
                title={title}
                onClick={() => onNavigate(id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-0 text-left"
              >
                <span
                  className="size-[7px] shrink-0 rounded-full"
                  style={{ background: dotColor }}
                />
                <span className="min-w-0 truncate">{title}</span>
                {inlineOnly ? (
                  <TextQuote
                    className="text-ink-3 size-3 shrink-0"
                    strokeWidth={1.75}
                    aria-label="正文内联引用"
                  />
                ) : (
                  <Link2
                    className="text-ink-3 size-3 shrink-0"
                    strokeWidth={1.75}
                    aria-label="双向链接"
                  />
                )}
              </button>
              <button
                type="button"
                aria-label="解除链接"
                title="解除链接（双边清理）"
                onClick={() => onUnlink(id)}
                className="text-ink-3 group-hover:text-danger hover:bg-danger-soft hover:text-danger rounded-tau-sm mr-1 grid size-[20px] shrink-0 cursor-pointer place-items-center"
              >
                <X className="size-[11px]" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={onOpenAddDialog}
          className="text-ink-3 hover:border-ink-3 hover:text-ink-2 rounded-tau-sm border-line-1 flex h-[30px] items-center gap-1 border border-dashed px-3 text-[12px] transition-colors"
        >
          <Plus className="size-[13px]" strokeWidth={1.75} />
          添加连接
        </button>
      </div>
    </section>
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
  category: ICard["category"];
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
            title: getEditorText(item.content, 26) || `卡片 #${item.id}`,
            category: item.category,
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
      rows.push({ id: result.id, title: resultDisplay(result).title, category: target.category });
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
              candidates.rows.map(item => {
                const color = CATEGORY_COLORS[item.category];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onLink([item.id]);
                      onOpenChange(false);
                    }}
                    className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-meta flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors"
                  >
                    <span
                      className="size-[7px] shrink-0 rounded-full"
                      style={{ background: color.text }}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="text-ink-3 shrink-0 text-[11px]">
                      {cardCategoryName[item.category]}
                    </span>
                  </button>
                );
              })}
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
