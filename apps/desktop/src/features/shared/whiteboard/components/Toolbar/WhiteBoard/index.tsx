import { Presentation, Plus, Link2 } from "lucide-react";
import { ToolMenu, type WhiteboardToolProps } from "@tau/whiteboard";

export default function WhiteBoardTool({ run }: WhiteboardToolProps) {
  return (
    <ToolMenu
      label="白板"
      icon={<Presentation strokeWidth={1.75} />}
      items={[
        { key: "create", label: "创建新白板", icon: Plus, onSelect: () => run("create") },
        { key: "reference", label: "引用已有白板", icon: Link2, onSelect: () => run("reference") },
      ]}
    />
  );
}
