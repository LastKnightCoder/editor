import { useEditorI18n } from "../../../../../../../i18n";
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
  const { t } = useEditorI18n();
  if (readOnly) return <React.Fragment>{children}</React.Fragment>;
  return (
    <ContextMenu
      content={
        <React.Fragment>
          <Menu.Item onSelect={onAdd}>{t("code.addHighlight")}</Menu.Item>
          <Menu.Item disabled={!canRemove} onSelect={onRemove}>
            {t("code.removeHighlight")}
          </Menu.Item>
        </React.Fragment>
      }
    >
      {children}
    </ContextMenu>
  );
}
