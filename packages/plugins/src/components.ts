import type { ReactElement } from "react";
import type { PluginContentRef } from "./data";
import type { PluginEntityRef } from "./app";

/**
 * 编辑器套件。full（默认）：与卡片详情相同的完整套件。compact：精简套件，与白板图形文字、
 * PDF 批注等简短内容的编辑器相同，不含内容链接、文件附件、白板块、数据库块与文档待办；
 * 正文里已有的这些块显示为占位，数据原样保留。编辑与预览同一份内容时应使用同一套件。
 */
export type ContentEditorKit = "full" | "compact";

/**
 * 与卡片详情相同的正文编辑器：协作、内置与已安装的编辑器扩展、文档待办都由宿主提供。
 * 可编辑需要所属实体的写入权限，只读需要读取权限；未授权时显示「允许访问」，由用户点击后询问。
 * 只能在插件页面内使用。
 */
export interface ContentEditorProps {
  contentRef: PluginContentRef;
  /** 默认 false */
  readonly?: boolean;
  /** 正文为空时的提示文字 */
  placeholder?: string;
  /** 打开后滚动并闪烁到的位置：从 Tau 打开插件内容时页面参数 params.at 原样传入 */
  at?: string;
  /** 默认 full */
  kit?: ContentEditorKit;
}

/** 正文开头几块的只读渲染，用于列表与卡面；需要所属实体的读取权限。 */
export interface ContentPreviewProps {
  contentRef: PluginContentRef;
  /** 显示的块数，默认 3 */
  maxBlocks?: number;
  /** 默认 full；与编辑这份内容的 ContentEditor 保持一致 */
  kit?: ContentEditorKit;
}

/**
 * 一项引用的显示：图标、类型名与标题由宿主渲染，内容已删除时显示「已删除」。授权口径与
 * context.app.describe 相同；未获准时显示类型名与「允许访问」，由用户点击后询问。
 */
export interface EntityRefProps {
  target: PluginEntityRef;
  /** 默认 true：点击时用 context.app.open 打开 */
  openable?: boolean;
}

/** 宿主注入的实现；SDK 根入口只引用 React 类型，不加载 React 运行时。 */
export interface ContentComponentsRuntime {
  ContentEditor(props: ContentEditorProps): ReactElement | null;
  ContentPreview(props: ContentPreviewProps): ReactElement | null;
  EntityRef(props: EntityRefProps): ReactElement | null;
}

let runtime: ContentComponentsRuntime | undefined;
export function configureContentComponents(value: ContentComponentsRuntime) {
  runtime = value;
}
function current() {
  if (!runtime) throw new Error("正文组件需要 Tau 桌面宿主");
  return runtime;
}

// 宿主实现内部使用 hook；占位按函数组件直接调用，保持一个固定的组件身份
export const ContentEditor = (props: ContentEditorProps) => current().ContentEditor(props);
export const ContentPreview = (props: ContentPreviewProps) => current().ContentPreview(props);
export const EntityRef = (props: EntityRefProps) => current().EntityRef(props);
