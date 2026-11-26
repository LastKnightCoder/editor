import type { IBlockPanelListItem } from "../../types/block-panel";

/** 分组只依据显式身份，不读取标题，也不修改扩展返回的对象。 */
export function groupBlockPanelItems(items: IBlockPanelListItem[]): IBlockPanelListItem[] {
  const byId = new Map<string, IBlockPanelListItem | null>();
  for (const item of items) {
    if (!item.id) continue;
    if (byId.has(item.id)) {
      console.warn(`[editor] 重复的块面板条目 id: ${item.id}`);
      byId.set(item.id, null);
    } else byId.set(item.id, item);
  }
  const parentOf = (item: IBlockPanelListItem): IBlockPanelListItem | undefined => {
    const parent = item.group ? byId.get(item.group) : undefined;
    if (!parent) return undefined;
    const seen = new Set([item]);
    let current: IBlockPanelListItem | null | undefined = parent;
    while (current) {
      if (seen.has(current)) return undefined;
      seen.add(current);
      current = current.group ? byId.get(current.group) : undefined;
    }
    return parent;
  };
  const children = new Map<IBlockPanelListItem, IBlockPanelListItem[]>();
  const roots: IBlockPanelListItem[] = [];
  for (const item of items) {
    const parent = parentOf(item);
    if (!parent) roots.push(item);
    else children.set(parent, [...(children.get(parent) ?? []), item]);
  }
  const project = (item: IBlockPanelListItem): IBlockPanelListItem => {
    const members = children.get(item);
    if (!members?.length) return item;
    const grouped = members.map(project);
    return {
      ...item,
      get title() {
        return item.title;
      },
      get description() {
        return item.description;
      },
      onClick: undefined,
      children: item.onClick ? [item, ...grouped] : [...(item.children ?? []), ...grouped],
    };
  };
  return roots.map(project);
}
