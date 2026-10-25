import {
  assertDataVersions,
  type DataMigration,
  type PreviousDataVersion,
} from "@tau/db-schema/data-versions";
import type { ComponentType, ReactNode } from "react";
import type { Descendant, Editor, Element, NodeEntry, TextUnit } from "slate";
import type { RenderElementProps } from "slate-react";

import type { Plugin } from "../utils/plugin";
import type { IBlockPanelListItem, IConfigItem } from "../types";
import type { EditorCommand, EditorHotkey } from "./command";
import type { EditorMenuContribution } from "./menu";
import type { ElementDrag } from "./drag";
import type { ElementIngestSpec } from "./ingest";
import type { ElementCopy } from "./copy";
import type { DecorationSpec, MarkSpec } from "./marks";
import type { InputRule } from "./inputRules";
import type { ContentResourceSpec } from "@tau/db-schema/content-resources";
import {
  normalizeContentContract,
  type ContentCollaborationSpec,
} from "@tau/db-schema/content-contracts";

export type ElementDataMigration = DataMigration;
export type PreviousElementVersion = PreviousDataVersion<ElementSpec>;

/**
 * 扩展 API v2（01 §5.1）：声明式描述「这个扩展贡献了什么」，内核负责装配、隔离与分发。
 * 所有扩展都是 defineExtension 的产物（旧 IExtension 适配层已删除，ER-019）。
 */

export const EXTENSION_API_VERSION = 1;

/** 元素渲染组件的 props；`attributes` 与 `children` 必须原样交给最外层元素 */
export interface ElementRenderProps<E extends Element = Element> {
  attributes: RenderElementProps["attributes"];
  element: E;
  children: ReactNode;
}

/**
 * 元素的行为：只在选区落在该类型的元素内时调用（从最内层元素往外找），
 * 不再全局改写 `editor.insertBreak`。返回 `true` 表示已处理；`false` 交给外层元素，最后回到默认行为。
 */
export interface ElementBehaviors<E extends Element = Element> {
  insertBreak?(editor: Editor, entry: NodeEntry<E>): boolean;
  deleteBackward?(editor: Editor, entry: NodeEntry<E>, unit: TextUnit): boolean;
  insertText?(editor: Editor, entry: NodeEntry<E>, text: string): boolean;
  /** 规范化该类型的节点；做了修改返回 `true`（Slate 会再规范化一轮） */
  normalize?(editor: Editor, entry: NodeEntry<E>): boolean;
}

export interface ElementEmptyContext {
  /** 使用当前编辑器已安装的声明判断子节点；未知或失败时保留。 */
  isEmpty(node: Descendant): boolean;
}

/**
 * void 块的公共外框：点选描边、右键菜单、选中时 Delete / Backspace 删除与 Escape 取消、末尾「添加段落」。
 * 声明后 render 只渲染内容（收到的 attributes 为空对象、children 为 null）。
 */
export interface ElementFrame {
  /** 末尾的「添加段落」，默认显示 */
  appendParagraph?: boolean;
  /** 选中时的按键 → 命令 id（如 `{ Enter: "yourname.gallery.edit" }`），命令收到该元素 */
  keys?: Readonly<Record<string, string>>;
}

export interface ElementSpec<E extends Element = Element> {
  /** 元素 type；内置类型沿用现有名字，兼容已有文档 */
  type: string;
  /** 数据结构与同步语义版本；无版本的旧声明不能进入新契约文档。 */
  dataVersion?: number;
  collaboration?: ContentCollaborationSpec;
  previousVersions?: readonly PreviousElementVersion[];
  migrations?: readonly ElementDataMigration[];
  kind: "block" | "inline";
  isVoid?: boolean;
  /** 后代的方向键/退格导航由领域接管，核心不执行默认相邻块导航。 */
  isolateBlockNavigation?: boolean;
  /** 判定源码等非 children 内容是否为空；未声明时内核不推断扩展私有字段 */
  isEmpty?: (element: E, context: ElementEmptyContext) => boolean;
  /** 渲染组件，可以是 `lazy()`：加载期间内核显示保留结构的空壳 */
  render: ComponentType<ElementRenderProps<E>>;
  behaviors?: ElementBehaviors<E>;
  /** 选区复制的包装策略；未声明时保留整棵片段子树。仅非 void 块生效。 */
  copy?: ElementCopy<E>;
  /** 拖拽声明（01 §5.4）：未声明的类型没有拖拽 chrome；块组件不再自己接手柄 */
  drag?: ElementDrag;
  /** 内容注入声明（01 §5.4）：drop 与 paste 共用的认领规则；块组件不再改写 insertData */
  ingest?: ElementIngestSpec;
  /** 节点里的资源字段：导出打包、协作上传、灯箱等只按它找图片、视频、音频与文件 */
  resources?: readonly ContentResourceSpec[];
  /** void 块的公共外框；只适用于 `kind: "block"` 且 `isVoid` 的元素 */
  frame?: boolean | ElementFrame;
}

export interface ExtensionLayerProps {
  /** 根 UI 在 Editable 外，不能通过 Slate 的 useReadOnly 读取此状态。 */
  readonly readOnly: boolean;
}

export interface EditorExtension {
  /** 全局唯一；内置用 `tau.*`，第三方将来用作者命名空间 */
  readonly id: string;
  readonly apiVersion: typeof EXTENSION_API_VERSION;
  readonly elements?: readonly ElementSpec[];
  readonly marks?: readonly MarkSpec[];
  /** 行内输入规则：输入成对定界符时转成标记或行内元素，如 `**粗体**`、`$公式$` */
  readonly inputRules?: readonly InputRule[];
  /** 暂态装饰（不进文档）；外观由本扩展 marks 里 keys 对应的声明渲染 */
  readonly decorations?: readonly DecorationSpec[];
  /** 在编辑器的 Slate/Kit 上下文挂载辅助 UI，组件自行接宿主浮层仲裁。 */
  readonly layers?: readonly ComponentType<ExtensionLayerProps>[];
  /** 块菜单条目；给函数时每次打开菜单求值 */
  readonly blockPanel?:
    | readonly IBlockPanelListItem[]
    | ((editor: Editor) => readonly IBlockPanelListItem[]);
  /** 悬浮工具条条目 */
  readonly toolbar?: readonly IConfigItem[];
  /** 贡献的命令：菜单、块面板、宿主都引用命令 id 触发动作 */
  readonly commands?: readonly EditorCommand[];
  /** 热键只绑命令 id（不绑函数）；同一键位允许多条声明按顺序匹配（沿用旧语义） */
  readonly hotkeys?: readonly EditorHotkey[];
  /** 手柄菜单与右键菜单的特有条目（01 §5.4）；条目只引用命令 id */
  readonly menu?: EditorMenuContribution;
  /** 贡献到指定源类型的菜单；不改变 menu 默认归属自身元素的规则。 */
  readonly menuFor?: Readonly<Record<string, EditorMenuContribution>>;
  /**
   * 挂到**其他**元素类型上的行为，给「在别的元素里触发、产出本元素」的场景，
   * 典型是快捷语法（段落里输入 `---` 回车变分割线）。与该类型自身的行为按扩展顺序一起分发。
   */
  readonly behaviorsFor?: Readonly<Record<string, ElementBehaviors>>;
  /**
   * @internal 受信任层（ER-005）：原始 Slate 插件，只给内核内置扩展表达声明式写不出的跨节点逻辑。
   * 将来开放第三方时不进公开类型。
   */
  readonly plugins?: readonly Plugin[];
}

export type ExtensionDefinition = Omit<EditorExtension, "apiVersion"> & {
  apiVersion?: typeof EXTENSION_API_VERSION;
};

export function defineExtension(definition: ExtensionDefinition): EditorExtension {
  if (!definition.id) throw new Error("[editor] defineExtension 缺少 id");
  const types = new Set<string>();
  for (const element of definition.elements ?? []) {
    assertElementVersions(element);
    if (types.has(element.type)) {
      throw new Error(`[editor] 扩展 "${definition.id}" 重复声明元素 "${element.type}"`);
    }
    types.add(element.type);
  }
  return Object.freeze({ ...definition, apiVersion: EXTENSION_API_VERSION });
}

/** 按元素类型收窄 render / behaviors 的参数类型；运行时原样返回 */
export function defineElement<E extends Element>(spec: ElementSpec<E>): ElementSpec {
  assertElementVersions(spec as unknown as ElementSpec);
  return spec as unknown as ElementSpec;
}

export function assertElementVersions(spec: ElementSpec): void {
  assertDataVersions(spec, element =>
    normalizeContentContract("validation", {
      type: element.type,
      dataVersion: element.dataVersion!,
      kind: element.kind,
      isVoid: element.isVoid,
      collaboration: element.collaboration,
      resources: element.resources,
    })
  );
}

export const isEditorExtension = (value: unknown): value is EditorExtension =>
  typeof value === "object" &&
  value !== null &&
  (value as EditorExtension).apiVersion === EXTENSION_API_VERSION &&
  typeof (value as EditorExtension).id === "string";
