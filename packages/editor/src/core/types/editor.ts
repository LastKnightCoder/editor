import { BaseEditor, Editor as SlateEditor, Point } from "slate";
import { ReactEditor } from "slate-react";
import { HistoryEditor } from "slate-history";
import { CustomElement, CustomText } from "./custom-element";
import type { ServiceIdentifier } from "../services/tokens";

export type CustomField = {
  type: string;
  /** 非React插件代码获取必选服务，未注册时抛错 */
  getService: <T>(id: ServiceIdentifier<T>) => T;
  /** 非React插件代码获取可选服务，未注册时返回 undefined */
  tryGetService: <T>(id: ServiceIdentifier<T>) => T | undefined;
  /** 拖放落点交认领管线（withIngest）分发 */
  handleDrop: (data: DataTransfer, point: Point) => Promise<void>;
  /** 命令注册表的程序化入口（api/command.ts）；热键、菜单、宿主统一经它执行 */
  commands?: import("../api/command").EditorCommandsHandle;
};

export type CustomEditor = BaseEditor & ReactEditor & HistoryEditor & CustomField;

/**
 * Editor component ref interface exposed via forwardRef
 */
export interface EditorRef {
  /** Focus the editor and move cursor to the end */
  focus: () => void;
  /** Deselect the current selection */
  deselect: () => void;
  /** Get the underlying Slate editor instance */
  getEditor: () => SlateEditor;
  /** 获取可编辑区根节点（[data-slate-editor]），未挂载时返回 null；宿主测量尺寸用，不要依赖内部 DOM 层级 */
  getEditableElement: () => HTMLElement | null;
  /** Check if the editor is currently focused */
  isFocus: () => boolean;
}

declare module "slate" {
  interface CustomTypes {
    Editor: CustomEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}
