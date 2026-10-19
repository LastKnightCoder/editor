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
  /** 该条目上方画一条组分隔线（由菜单聚合器在组边界标记） */
  separator?: boolean;
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
