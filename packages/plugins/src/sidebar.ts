import type { Disposable } from "./contract";
import type { PluginPageHandle, PluginPageParams } from "./pages";
import type { PluginIcon, PluginIconProps } from "./icons";
import { normalizePageParams } from "./pages";
import { assertLocalId } from "./ids";

/** 与 PluginIconProps 相同 */
export type PluginSidebarIconProps = PluginIconProps;
/** 与 PluginIcon 相同 */
export type PluginSidebarIcon = PluginIcon;

export const SIDEBAR_GROUPS = Object.freeze({
  daily: "daily",
  knowledge: "knowledge",
  learning: "learning",
  ai: "ai",
  sharing: "sharing",
  plugins: "plugins",
} as const);

export interface PluginSidebarGroupDefinition {
  id: string;
  title: string;
}

export interface PluginSidebarGroupHandle extends Disposable {
  readonly id: string;
}

export interface PluginSidebarItemDefinition {
  id: string;
  title: string;
  /** 传入 SVG 组件本身；缺省使用插件图标。 */
  icon?: PluginSidebarIcon;
  /** 缺省或分组不存在时归入默认插件分组。 */
  group?: string;
  page: PluginPageHandle;
  params?: PluginPageParams;
}

/** 子项色点，与宿主待办项目、分组同一套色板 */
export type PluginSidebarTone = "rose" | "orange" | "yellow" | "green" | "blue" | "purple" | "gray";

export interface PluginSidebarMenuEntry {
  title: string;
  /** 危险操作（如删除）显示为红色，并与前面的条目隔开 */
  danger?: boolean;
  run(): unknown;
}

export interface PluginSidebarChild {
  /** 在同一条目内唯一 */
  id: string;
  title: string;
  /** 点击后以这组参数打开条目的页面；当前页参数包含这组参数时，子项显示为选中 */
  params: PluginPageParams;
  tone?: PluginSidebarTone;
  /** 子项右侧的计数，0 不显示 */
  count?: number;
  /** 右键菜单 */
  menu?: readonly PluginSidebarMenuEntry[];
  /** 接收拖放：type 为 dragType 的参数，run 收到拖拽数据 */
  onDrop?: { type: string; run(data: string): unknown };
}

/** 子项列表末尾的动作行（如「新建分组」） */
export interface PluginSidebarAction {
  title: string;
  /** 缺省为加号 */
  icon?: PluginSidebarIcon;
  run(): unknown;
}

/** 只改传入的字段；badge 为 null 或 0 时隐藏，action 为 null 时移除 */
export interface PluginSidebarItemUpdate {
  badge?: number | null;
  children?: readonly PluginSidebarChild[];
  action?: PluginSidebarAction | null;
}

export interface PluginSidebarItemHandle extends Disposable {
  update(patch: PluginSidebarItemUpdate): void;
}

export interface PluginSidebar {
  registerGroup(definition: PluginSidebarGroupDefinition): PluginSidebarGroupHandle;
  /** 条目所在页面在栈顶且侧栏展开时，子项与动作行展开在条目下方 */
  registerItem(definition: PluginSidebarItemDefinition): PluginSidebarItemHandle;
  /**
   * 拖拽类型：插件页面拖起数据时用 dataTransfer.setData(dragType(type), data)，
   * 子项 onDrop 声明同一个 type 才能接收；宿主和其他插件的拖拽不会落到插件子项上。
   */
  dragType(type: string): string;
}

/** 侧栏条目的展示状态，宿主据此渲染；回调已由宿主包装 */
export interface PluginSidebarItemState {
  badge: number;
  children: readonly PluginSidebarChild[];
  action: PluginSidebarAction | null;
}

const SIDEBAR_TONES = new Set<string>([
  "rose",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "gray",
]);
const MAX_CHILDREN = 200;
const MAX_MENU_ENTRIES = 8;

export function sidebarDragType(pluginId: string, type: string): string {
  assertLocalId(type);
  return `application/x-tau-plugin.${pluginId}.${type}`.toLowerCase();
}

function readCount(value: unknown, label: string): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new Error(`${label}必须是非负整数`);
  return value;
}

function readTitle(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}标题不能为空`);
  return value;
}

function readCallback<T extends (...args: never[]) => unknown>(value: unknown, label: string): T {
  if (typeof value !== "function") throw new Error(`${label}必须是函数`);
  return value as T;
}

/**
 * 校验并冻结一次 update 的结果；wrap 包装插件回调（宿主在里面核对插件仍处于启用状态），
 * 拖拽类型由 dragType 加上插件命名空间。
 */
export function snapshotSidebarUpdate(
  previous: PluginSidebarItemState,
  patch: PluginSidebarItemUpdate,
  options: {
    wrap: <A extends unknown[]>(run: (...args: A) => unknown) => (...args: A) => unknown;
    dragType: (type: string) => string;
  }
): PluginSidebarItemState {
  if (!patch || typeof patch !== "object") throw new Error("侧边栏更新必须是对象");
  const badge = patch.badge === undefined ? previous.badge : readCount(patch.badge, "角标");
  let children = previous.children;
  if (patch.children !== undefined) {
    if (!Array.isArray(patch.children)) throw new Error("侧边栏子项必须是数组");
    if (patch.children.length > MAX_CHILDREN) throw new Error(`侧边栏子项最多 ${MAX_CHILDREN} 个`);
    const ids = new Set<string>();
    children = Object.freeze(
      patch.children.map((child: PluginSidebarChild) => {
        if (!child || typeof child !== "object") throw new Error("侧边栏子项必须是对象");
        if (typeof child.id !== "string" || !child.id || child.id.length > 128)
          throw new Error("侧边栏子项 ID 须为 1 至 128 个字符");
        if (ids.has(child.id)) throw new Error(`侧边栏子项 ID 重复：${child.id}`);
        ids.add(child.id);
        if (child.tone !== undefined && !SIDEBAR_TONES.has(child.tone))
          throw new Error("侧边栏子项色点无效");
        const menu = child.menu ?? [];
        if (!Array.isArray(menu)) throw new Error("侧边栏子项菜单必须是数组");
        if (menu.length > MAX_MENU_ENTRIES)
          throw new Error(`侧边栏子项菜单最多 ${MAX_MENU_ENTRIES} 条`);
        let onDrop: PluginSidebarChild["onDrop"];
        if (child.onDrop !== undefined) {
          if (typeof child.onDrop?.type !== "string" || !child.onDrop.type)
            throw new Error("侧边栏拖放类型不能为空");
          onDrop = Object.freeze({
            type: options.dragType(child.onDrop.type),
            run: options.wrap(
              readCallback<(data: string) => unknown>(child.onDrop.run, "拖放回调")
            ),
          });
        }
        return Object.freeze({
          id: child.id,
          title: readTitle(child.title, "侧边栏子项"),
          params: Object.freeze(normalizePageParams(child.params)),
          ...(child.tone ? { tone: child.tone } : {}),
          count: readCount(child.count, "子项计数"),
          menu: Object.freeze(
            menu.map((entry: PluginSidebarMenuEntry) =>
              Object.freeze({
                title: readTitle(entry?.title, "菜单条目"),
                danger: Boolean(entry.danger),
                run: options.wrap(readCallback<() => unknown>(entry.run, "菜单回调")),
              })
            )
          ),
          ...(onDrop ? { onDrop } : {}),
        });
      })
    );
  }
  let action = previous.action;
  if (patch.action !== undefined) {
    action =
      patch.action === null
        ? null
        : Object.freeze({
            title: readTitle(patch.action?.title, "侧边栏动作"),
            ...(patch.action.icon ? { icon: patch.action.icon } : {}),
            run: options.wrap(readCallback<() => unknown>(patch.action.run, "动作回调")),
          });
  }
  return Object.freeze({ badge, children, action });
}
