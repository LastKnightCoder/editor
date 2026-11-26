import { useDocumentInsertI18n } from "../../../insert.i18n";
import { FileText } from "lucide-react";
import { ChromeButton, type WhiteboardToolProps } from "@tau/whiteboard";

export default function DocumentTool({ run }: WhiteboardToolProps) {
  const { t } = useDocumentInsertI18n();
  return (
    <ChromeButton label={t("tool.document")} onClick={() => run()}>
      <FileText strokeWidth={1.75} />
    </ChromeButton>
  );
}
