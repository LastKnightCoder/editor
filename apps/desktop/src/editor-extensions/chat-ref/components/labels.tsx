import { AlertTriangle, Minimize2, PanelRightOpen } from "lucide-react";
import { IconButton } from "@tau/ui";
import { useChatRefI18n } from "../i18n";

export function ChatRefTitle({ title }: { title: string }) {
  const { t } = useChatRefI18n();
  return title || t("untitled");
}
export function QuoteSource({ turn, model }: { turn?: number; model?: string }) {
  const { t } = useChatRefI18n();
  const source = [turn ? t("turn", { turn }) : "", model ?? ""].filter(Boolean).join(" · ");
  return source ? <span className="shrink-0">· {source}</span> : null;
}
export function QuoteDeletedNotice() {
  const { t } = useChatRefI18n();
  return (
    <span className="text-warn inline-flex shrink-0 items-center gap-1">
      <AlertTriangle className="size-3" strokeWidth={1.75} />
      {t("quote.deleted")}
    </span>
  );
}
export function QuoteAction({ kind, onClick }: { kind: "dock" | "inline"; onClick: () => void }) {
  const { t } = useChatRefI18n();
  const label = t(kind === "dock" ? "open.dock" : "quote.toInline");
  return (
    <IconButton title={label} aria-label={label} className="size-6" onClick={onClick}>
      {kind === "dock" ? (
        <PanelRightOpen size={13} strokeWidth={1.75} />
      ) : (
        <Minimize2 size={13} strokeWidth={1.75} />
      )}
    </IconButton>
  );
}
