import type { EditorKit } from "@tau/editor";
import { resolveElementMenu, type ContextMenuItem } from "@tau/editor/api";
import { Element, type Editor } from "slate";
import { inSingleUndoStep, normalizeBlockIndices } from "./blockOps";

/** 内核转换父项：各扩展把转换子项合并到这里 */
export const TRANSFORM_MENU_KEY = "tau.transform";
/** 内核剪切项：块选择改用宿主多块剪切，执行后退出块选择 */
export const CUT_MENU_KEY = "tau.block.cut";
/** 操作栏已直接提供的块菜单项，「更多」中不重复出现 */
const ACTION_BAR_MENU_KEYS: ReadonlySet<string> = new Set([
  "tau.block.move-up",
  "tau.block.move-down",
  "tau.block.copy",
  "tau.block.delete",
  TRANSFORM_MENU_KEY,
]);

/** 内置来源：内核与内置扩展（`tau.*`）、宿主扩展（`host.*`）、内核命令（`editor`）；无来源的补充条目也算内置 */
export function isBuiltinMenuOwner(owner: string | undefined): boolean {
  return !owner || owner === "editor" || owner.startsWith("tau.") || owner.startsWith("host.");
}

/** 对第 index 个顶层块求值完整块菜单；块不存在或非元素时为空 */
export function resolveBlockMenu(kit: EditorKit, editor: Editor, index: number): ContextMenuItem[] {
  const element = editor.children[index];
  return element && Element.isElement(element) ? resolveElementMenu(kit, editor, element) : [];
}

/** 去掉禁用项（ActionSheet 无禁用态）与既无命令也无可用子项的项 */
export function pruneMenuItems(items: readonly ContextMenuItem[]): ContextMenuItem[] {
  return items.flatMap(item => {
    if (item.disabled) return [];
    const children = item.children ? pruneMenuItems(item.children) : undefined;
    if (!item.onSelect && !children?.length) return [];
    return [{ ...item, children: children?.length ? children : undefined }];
  });
}

/** 菜单中的可用转换子项 */
export function getTransformItems(items: readonly ContextMenuItem[]): ContextMenuItem[] {
  const parent = items.find(item => item.key === TRANSFORM_MENU_KEY);
  return pruneMenuItems(parent?.children ?? []).filter(item => item.onSelect);
}

/** 所有选中块都可用的转换项（按 key 求交集，顺序与标题取首个块） */
export function resolveSharedTransforms(
  kit: EditorKit,
  editor: Editor,
  indices: readonly number[]
): ContextMenuItem[] {
  const sorted = normalizeBlockIndices(indices, editor.children.length);
  if (sorted.length === 0) return [];
  const [first, ...rest] = sorted.map(index =>
    getTransformItems(resolveBlockMenu(kit, editor, index))
  );
  const restKeys = rest.map(items => new Set(items.map(item => item.key)));
  return first.filter(item => restKeys.every(keys => keys.has(item.key)));
}

/**
 * 对每个选中块执行同 key 的转换，合并为一个撤销步。菜单项的 onSelect 绑定单个元素，
 * 因此逐块按元素引用重新求值；自后向前执行，前面块的路径不受后面块转换（含块数变化）影响。
 */
export function applyTransformToBlocks(
  kit: EditorKit,
  editor: Editor,
  indices: readonly number[],
  key: string
): void {
  const elements = normalizeBlockIndices(indices, editor.children.length).map(
    index => editor.children[index]
  );
  inSingleUndoStep(editor, () => {
    for (const element of [...elements].reverse()) {
      if (!Element.isElement(element)) continue;
      const item = getTransformItems(resolveElementMenu(kit, editor, element)).find(
        candidate => candidate.key === key
      );
      item?.onSelect?.();
    }
  });
}

export type MoreMenuGroups = {
  /** 内置项，按菜单分隔线分组 */
  builtin: ContextMenuItem[][];
  /** 非内置来源的项 */
  plugin: ContextMenuItem[];
  /** 危险项，排在最后 */
  danger: ContextMenuItem[];
};

/** 「更多」的分组：排除操作栏已有项与禁用项；危险项单独成组；插件项单独成组 */
export function buildMoreMenuGroups(items: readonly ContextMenuItem[]): MoreMenuGroups {
  const sections: ContextMenuItem[][] = [];
  for (const item of items) {
    if (item.separator || sections.length === 0) sections.push([]);
    sections[sections.length - 1].push(item);
  }
  const builtin: ContextMenuItem[][] = [];
  const plugin: ContextMenuItem[] = [];
  const danger: ContextMenuItem[] = [];
  for (const section of sections) {
    const group: ContextMenuItem[] = [];
    for (const item of pruneMenuItems(
      section.filter(entry => !ACTION_BAR_MENU_KEYS.has(entry.key))
    )) {
      if (item.danger) danger.push(item);
      else if (!isBuiltinMenuOwner(item.owner)) plugin.push(item);
      else group.push(item);
    }
    if (group.length > 0) builtin.push(group);
  }
  return { builtin, plugin, danger };
}
