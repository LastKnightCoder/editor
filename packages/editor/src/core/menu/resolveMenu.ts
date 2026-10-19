import type {
  EditorMenuContext,
  EditorMenuContribution,
  EditorMenuEntry,
  MenuValue,
} from "../api/menu";
import type { ContextMenuItem } from "../components/EditorContextMenu/types";

/**
 * 把各扩展贡献的菜单声明求值成渲染件条目（01 §5.4）。
 * when 决定条目是否出现；disabled 决定灰显；执行统一走 `editor.commands.execute`
 * （与热键共享命令的 enablement 与熔断）。求值错误只丢出错的条目，不波及其他扩展。
 * 顶层条目按 id 去重，后声明的覆盖先声明的——扩展可以覆盖内核默认条目。
 */

/** 一个扩展贡献的菜单来源；owner 只用于日志 */
export interface MenuContributionSource {
  readonly owner: string;
  readonly menu: EditorMenuContribution;
  /**
   * 贡献者注册的元素类型：条目默认只出现在这些类型上（特有菜单不进别的块的菜单）。
   * 不注册元素的扩展（内核默认菜单、preview 菜单）为全局条目，靠自身 when 限定范围。
   */
  readonly types?: readonly string[];
}

/** 组的展示顺序：扩展特有 → 类型转换 → 块级动作（删除等收尾）；未知组按首现排在已知组后 */
const KNOWN_GROUPS = ["actions", "transform", "block"] as const;
const DEFAULT_GROUP = "actions";

const resolveMenuValue = <T>(
  value: MenuValue<T> | undefined,
  ctx: EditorMenuContext
): T | undefined =>
  typeof value === "function" ? (value as (ctx: EditorMenuContext) => T)(ctx) : value;

/** 求值出错按保守值处理并告警，不让单个条目拖垮整份菜单 */
function safePredicate(
  predicate: (ctx: EditorMenuContext) => boolean,
  ctx: EditorMenuContext,
  owner: string,
  fallback: boolean
): boolean {
  try {
    return predicate(ctx);
  } catch (error) {
    console.error(`[editor] 扩展 "${owner}" 的菜单谓词出错:`, error);
    return fallback;
  }
}

function renderEntry(
  entry: EditorMenuEntry,
  ctx: EditorMenuContext,
  owner: string,
  childOrders: WeakMap<ContextMenuItem, number>
): ContextMenuItem | null {
  if (entry.when && !safePredicate(entry.when, ctx, owner, false)) return null;

  const children = (entry.children ?? [])
    .map(child => safeRenderEntry(child, ctx, owner, childOrders))
    .filter((item): item is ContextMenuItem => item !== null)
    .sort((a, b) => (childOrders.get(a) ?? 0) - (childOrders.get(b) ?? 0));
  if (!entry.command && children.length === 0) return null;

  const item: ContextMenuItem = {
    key: entry.id,
    label: resolveMenuValue(entry.title, ctx) ?? entry.id,
    icon: resolveMenuValue(entry.icon, ctx),
    danger: entry.danger,
    disabled: entry.disabled ? safePredicate(entry.disabled, ctx, owner, true) : false,
    children: children.length ? children : undefined,
    onSelect: entry.command
      ? () => ctx.editor.commands?.execute(entry.command!, entry.payload, ctx.element, ctx.path)
      : undefined,
  };
  childOrders.set(item, entry.order ?? Number.MAX_SAFE_INTEGER);
  return item;
}

function safeRenderEntry(
  entry: EditorMenuEntry,
  ctx: EditorMenuContext,
  owner: string,
  childOrders: WeakMap<ContextMenuItem, number>
): ContextMenuItem | null {
  try {
    return renderEntry(entry, ctx, owner, childOrders);
  } catch (error) {
    console.error(`[editor] 扩展 "${owner}" 的菜单条目出错:`, error);
    return null;
  }
}

export function resolveBlockMenuItems(
  sources: readonly MenuContributionSource[],
  ctx: EditorMenuContext,
  extras?: readonly ContextMenuItem[]
): ContextMenuItem[] {
  interface ScoredItem {
    item: ContextMenuItem;
    group: string;
    order: number;
    seq: number;
    mergeChildren: boolean;
  }
  // 顶层条目按 id 去重：后声明的覆盖先声明的（扩展可覆盖内核默认条目，如带确认的删除）
  const collected = new Map<string, ScoredItem>();
  const childOrders = new WeakMap<ContextMenuItem, number>();

  for (const source of sources) {
    // 特有菜单锚定到贡献者自己的元素类型，不需要（也不应该）逐条目写 when
    if (source.types && !source.types.includes(ctx.element.type as string)) continue;
    let entries: readonly EditorMenuEntry[];
    try {
      entries = typeof source.menu === "function" ? source.menu(ctx.editor) : source.menu;
    } catch (error) {
      console.error(`[editor] 扩展 "${source.owner}" 菜单声明出错:`, error);
      continue;
    }
    for (const entry of entries) {
      const item = safeRenderEntry(entry, ctx, source.owner, childOrders);
      if (item) {
        const previous = collected.get(item.key);
        const mergeChildren = entry.mergeChildren === true && !entry.command;
        if (mergeChildren && previous?.mergeChildren) {
          const children = new Map(
            [...(previous.item.children ?? []), ...(item.children ?? [])].map(child => [
              child.key,
              child,
            ])
          );
          item.children = [...children.values()].sort(
            (a, b) => (childOrders.get(a) ?? 0) - (childOrders.get(b) ?? 0)
          );
        }
        collected.set(item.key, {
          item,
          group: entry.group ?? DEFAULT_GROUP,
          order: entry.order ?? Number.MAX_SAFE_INTEGER,
          seq: collected.size,
          mergeChildren,
        });
      }
    }
  }

  const groups = new Map<string, ScoredItem[]>();
  for (const scored of collected.values()) {
    groups.set(scored.group, [...(groups.get(scored.group) ?? []), scored]);
  }

  // 组内按 order，同 order 保持声明顺序；未知组排在已知组后、按组内首条的声明位置
  const groupFirstSeq = (items: ScoredItem[]) => Math.min(...items.map(scored => scored.seq));
  const ordered = [...groups.entries()].sort(([groupA, itemsA], [groupB, itemsB]) => {
    const known = KNOWN_GROUPS as readonly string[];
    const sortKey = (group: string, items: ScoredItem[]) => {
      const rank = known.indexOf(group);
      return rank === -1 ? known.length + groupFirstSeq(items) : rank;
    };
    return sortKey(groupA, itemsA) - sortKey(groupB, itemsB);
  });

  const items: ContextMenuItem[] = [];
  for (const [index, [, groupItems]] of ordered.entries()) {
    const sorted = [...groupItems].sort((a, b) => a.order - b.order || a.seq - b.seq);
    if (index > 0) sorted[0].item.separator = true;
    items.push(...sorted.map(scored => scored.item));
  }
  return extras?.length ? [...items, ...extras] : items;
}
