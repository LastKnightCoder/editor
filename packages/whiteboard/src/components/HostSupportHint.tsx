import { useNodeI18n } from "../nodes-i18n";
export function HostSupportHint({
  kind,
}: {
  kind: "document" | "webview" | "video" | "whiteboard";
}) {
  const { t } = useNodeI18n();
  return <>{t(`nodes.host.${kind}`)}</>;
}
