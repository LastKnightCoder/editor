import { useMemo } from "react";
import type { Element } from "slate";
import { useReadOnly, useSlateStatic } from "slate-react";
import { useInheritedKit } from "../../kit/context";
import { resolveElementMenu } from "../../hooks/useDragHandlerMenu";
import EditorContextMenu from "../EditorContextMenu";

export interface ElementMenuProps {
  element: Element;
  position: { x: number; y: number };
  onClose: () => void;
}

/** 在指定位置打开目标元素已注册的菜单，不接受绕过命令协议的条目。 */
export default function ElementMenu({ element, position, onClose }: ElementMenuProps) {
  const editor = useSlateStatic();
  const readonly = useReadOnly();
  const kit = useInheritedKit();
  const items = useMemo(() => resolveElementMenu(kit, editor, element), [kit, editor, element]);
  return (
    <EditorContextMenu
      visible
      position={position}
      items={items}
      readonly={readonly}
      onClose={onClose}
    />
  );
}
