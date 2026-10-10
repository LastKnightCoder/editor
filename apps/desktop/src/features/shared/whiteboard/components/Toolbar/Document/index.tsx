import { FileText } from "lucide-react";
import { ChromeButton, type WhiteboardToolProps } from "@tau/whiteboard";

export default function DocumentTool({ run }: WhiteboardToolProps) {
  return (
    <ChromeButton label="文档" onClick={() => run()}>
      <FileText strokeWidth={1.75} />
    </ChromeButton>
  );
}
