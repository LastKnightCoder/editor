import type { ReactNode } from "react";
import type { Editor, Element, Path } from "slate";

/**
 * 菜单贡献点（01 §5.4）：手柄菜单与右键菜单统一的数据来源。
 * 条目只引用命令 id（不写内联函数），执行、enablement 与熔断与热键共用命令注册表。
 */

/** 菜单声明的求值上下文：菜单针对的目标元素及其路径（打开时求一次） */
export interface EditorMenuContext {
  editor: Editor;
  element: Element;
  path: Path;
}

/** `T | ((ctx) => T)`：静态声明或打开菜单时求值（如「收起 / 展开」的动态标题） */
export type MenuValue<T> = T | ((ctx: EditorMenuContext) => T);

export interface EditorMenuEntry {
  /** 条目 id，同一份菜单内唯一；内核默认条目直接用命令 id */
  id: string;
  title: MenuValue<string>;
  icon?: MenuValue<ReactNode>;
  /** 引用的命令 id；只有 `children` 的父条目可省 */
  command?: string;
  /** 命令的静态参数（如 `{ level: 2 }`），与目标元素一起进命令上下文 */
  payload?: unknown;
  /** `false` 时条目（连同 children）不出现：条目对目标元素的适用范围 */
  when?: (ctx: EditorMenuContext) => boolean;
  /** `false` 时灰显（enablement），打开菜单时求值 */
  disabled?: (ctx: EditorMenuContext) => boolean;
  /** 分组；缺省 `"actions"`（扩展特有条目）。组间画分隔线，组内按 `order` 与声明顺序 */
  group?: string;
  order?: number;
  danger?: boolean;
  children?: readonly EditorMenuEntry[];
  /** 同名顶层无命令菜单均声明时合并子项；未声明仍整项覆盖。 */
  mergeChildren?: boolean;
}

/** 扩展贡献的菜单：静态数组，或需要按 editor 求值的工厂（如过滤服务提供的动作） */
export type EditorMenuContribution =
  readonly EditorMenuEntry[] | ((editor: Editor) => readonly EditorMenuEntry[]);
