/** PDF 目录 / 书签对象的纯逻辑：取目标页、拍平目录树、按当前页找所在章节 */

import { PdfActionType, type PdfBookmarkObject } from "@embedpdf/models";

/** 目录项或书签指向的页（从 1 开始）；外部链接等没有页的返回 null */
export function targetPage(object: PdfBookmarkObject): number | null {
  const target = object.target;
  if (!target) return null;
  if (target.type === "destination") return target.destination.pageIndex + 1;
  const action = target.action;
  if (action.type === PdfActionType.Goto || action.type === PdfActionType.RemoteGoto) {
    return action.destination.pageIndex + 1;
  }
  return null;
}

export interface OutlineRow {
  key: string;
  title: string;
  page: number | null;
  depth: number;
}

export function flattenOutline(items: PdfBookmarkObject[], depth = 0, prefix = ""): OutlineRow[] {
  return items.flatMap((item, index) => {
    const key = `${prefix}${index}`;
    return [
      { key, title: item.title?.trim() || "（无标题）", page: targetPage(item), depth },
      ...flattenOutline(item.children ?? [], depth + 1, `${key}.`),
    ];
  });
}

/** 当前页所在的目录项：最后一个起始页 ≤ 当前页的条目 */
export function activeOutlineKey(rows: OutlineRow[], currentPage: number): string | null {
  let active: string | null = null;
  for (const row of rows) {
    if (row.page != null && row.page <= currentPage) active = row.key;
  }
  return active;
}
