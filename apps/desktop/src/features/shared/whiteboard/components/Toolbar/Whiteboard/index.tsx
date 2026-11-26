import { useDocumentInsertI18n } from "../../../insert.i18n";
import { Presentation, Plus, Link2 } from "lucide-react";
import { ToolMenu, type WhiteboardToolProps } from "@tau/whiteboard";

export default function WhiteboardTool({ run }: WhiteboardToolProps) {
  const { t } = useDocumentInsertI18n();
  return (
    <ToolMenu
      label={t("tool.whiteboard")}
      icon={<Presentation strokeWidth={1.75} />}
      items={[
        { key: "create", label: t("whiteboard.create"), icon: Plus, onSelect: () => run("create") },
        {
          key: "reference",
          label: t("whiteboard.reference"),
          icon: Link2,
          onSelect: () => run("reference"),
        },
      ]}
    />
  );
}
