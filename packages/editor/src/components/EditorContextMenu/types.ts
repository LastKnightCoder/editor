import { ReactNode } from "react";
import { Editor, Path, Element } from "slate";

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  children?: ContextMenuItem[];
  onSelect?: () => void;
}

export interface EditorContextMenuProps {
  readonly?: boolean;
  visible: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

export interface BuildMenuParams<T extends Element> {
  element: T;
  editor: Editor;
  path: Path;
}

export interface UseDragHandlerMenuOptions<T extends Element> {
  element: T;
  editor: Editor;
  buildMenuItems: (params: BuildMenuParams<T>) => ContextMenuItem[];
}
