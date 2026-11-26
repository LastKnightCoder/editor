import { useShellI18n } from "../app/shell.i18n";
const LINES = ["w-11/12", "w-4/5", "w-full", "w-3/5"];

/** 可编辑正文在插件会话落定前的占位：只占编辑区，页面其他部分照常可用。 */
export function EditorKitPending({ className = "" }: { className?: string }) {
  const { t } = useShellI18n();
  return (
    <div
      role="status"
      aria-label={t("editor.preparing")}
      className={`flex flex-col gap-3 py-2 ${className}`}
    >
      {LINES.map(width => (
        <div key={width} className={`bg-hover h-3.5 animate-pulse rounded ${width}`} />
      ))}
    </div>
  );
}
