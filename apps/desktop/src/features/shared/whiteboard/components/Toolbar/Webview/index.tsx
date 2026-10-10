import { Globe } from "lucide-react";
import { ChromeButton, type WhiteboardToolProps } from "@tau/whiteboard";

export default function WebviewTool({ run }: WhiteboardToolProps) {
  return (
    <ChromeButton label="网页" onClick={() => run()}>
      <Globe strokeWidth={1.75} />
    </ChromeButton>
  );
}
