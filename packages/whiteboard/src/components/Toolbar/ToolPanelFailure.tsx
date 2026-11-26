import { useWhiteboardI18n } from "../../i18n";

export default function ToolPanelFailure() {
  const { t } = useWhiteboardI18n();
  return <p role="alert">{t("toolbar.panelFailed")}</p>;
}
