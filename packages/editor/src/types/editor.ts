import { BaseEditor, Descendant, Editor as SlateEditor, Point } from "slate";
import { ReactEditor } from "slate-react";
import { HistoryEditor } from "slate-history";
import { CustomElement, CustomText } from "./custom-element";
import type { ServiceIdentifier } from "../services/tokens";

export type CustomField = {
  type: string;
  isResetValue: boolean;
  /** 非React插件代码获取必选服务，未注册时抛错 */
  getService: <T>(id: ServiceIdentifier<T>) => T;
  /** 非React插件代码获取可选服务，未注册时返回 undefined */
  tryGetService: <T>(id: ServiceIdentifier<T>) => T | undefined;
  handleDrop?: (files: FileList, point: Point) => Promise<void>;
  dropHandlers?: {
    image?: (file: File) => Promise<void>;
    audio?: (file: File) => Promise<void>;
    video?: (file: File) => Promise<void>;
  };
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
  /** Set editor content to new nodes */
  setEditorValue: (nodes: Descendant[]) => void;
  /** Get the underlying Slate editor instance */
  getEditor: () => SlateEditor;
  /** Scroll a header element into view by index */
  scrollHeaderIntoView: (index: number) => void;
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
