import React from "react";
import { ContextMenu, Menu } from "@tau/ui";

interface HighlightMenuProps {
  children: React.ReactNode;
  readOnly: boolean;
  canRemove: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

export default function HighlightMenu({
  children,
  readOnly,
  canRemove,
  onAdd,
  onRemove,
}: HighlightMenuProps) {
  if (readOnly) return <React.Fragment>{children}</React.Fragment>;
  return (
    <ContextMenu
      content={
        <React.Fragment>
          <Menu.Item onSelect={onAdd}>高亮选中行</Menu.Item>
          <Menu.Item disabled={!canRemove} onSelect={onRemove}>
            取消高亮选中行
          </Menu.Item>
        </React.Fragment>
      }
    >
      {children}
    </ContextMenu>
  );
}
