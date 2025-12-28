import { BaseEditor, Descendant, Editor as SlateEditor, Point } from "slate";
import { ReactEditor } from "slate-react";
import { HistoryEditor } from "slate-history";
import { CustomElement, CustomText } from "./custom-element";
import type { EditorServices } from "./services";

export type CustomField = {
  type: string;
  isResetValue: boolean;
  services?: EditorServices;
  handleDrop?: (files: FileList, point: Point) => Promise<void>;
  dropHandlers?: {
    image?: (file: File) => Promise<void>;
    audio?: (file: File) => Promise<void>;
    video?: (file: File) => Promise<void>;
  };
};

export type CustomEditor = BaseEditor &
  ReactEditor &
  HistoryEditor &
  CustomField;

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
