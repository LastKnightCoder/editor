import { useImageWebviewI18n } from "../../../image-webview.i18n";
import { Globe } from "lucide-react";
import { ChromeButton, type WhiteboardToolProps } from "@tau/whiteboard";

export default function WebviewTool({ run }: WhiteboardToolProps) {
  const { t } = useImageWebviewI18n();
  return (
    <ChromeButton label={t("tool.webview")} onClick={() => run()}>
      <Globe strokeWidth={1.75} />
    </ChromeButton>
  );
}
