import { usePresentationI18n } from "./i18n";
/** 快捷键面板与键帽 */
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@tau/ui";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-line-1 bg-surface text-tau-micro text-ink-3 inline-block rounded-[5px] border px-1.5 font-mono leading-[18px]">
      {children}
    </kbd>
  );
}

/** 一行一项：左说明、右按键；鼠标操作用 hint 文本而非键帽 */
function Row({ label, keys, hint }: { label: string; keys?: string[]; hint?: string }) {
  return (
    <div className="text-ink-2 flex items-center justify-between gap-6 whitespace-nowrap">
      <span>{label}</span>
      {hint ? (
        <span className="text-tau-sm text-ink-3">{hint}</span>
      ) : (
        <span className="flex gap-1">
          {keys?.map(key => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </span>
      )}
    </div>
  );
}

function Group({ title }: { title: string }) {
  return <div className="text-tau-micro text-ink-3 mt-2 tracking-wide first:mt-0">{title}</div>;
}

interface HelpPanelProps {
  paged: boolean;
  onClose(): void;
}

export function HelpPanel({ paged, onClose }: HelpPanelProps) {
  const { t } = usePresentationI18n();
  return (
    <div className="bg-overlay absolute inset-0 z-20 grid place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={t("help.dialog")}
        className="bg-surface shadow-float text-tau-body rounded-tau-lg w-[380px] px-6 py-[22px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-tau-title mb-3.5 flex items-center justify-between font-semibold">
          {t("help.title")}
          <IconButton aria-label={t("close")} onClick={onClose}>
            <X className="size-4" strokeWidth={1.75} />
          </IconButton>
        </div>
        <div className="flex flex-col gap-2">
          <Group title={t("advance")} />
          <Row label={t("help.next")} keys={["→", "Space", "PgDn"]} />
          <Row label={t("help.previous")} keys={["←", "PgUp"]} />
          <Row label={t("help.click")} hint={t("help.clickHint")} />
          <Row label={t("help.wheel")} hint={t("help.wheelHint")} />
          {paged && <Row label={t("help.firstLast")} keys={["Home", "End"]} />}
          {paged && <Row label={t("help.jump")} keys={[t("help.numbers"), "Enter"]} />}
          <Group title={t("help.screen")} />
          {paged && <Row label={t("overview")} keys={["O"]} />}
          <Row label={t("help.theme")} keys={["D"]} />
          <Row label={t("fullscreen")} keys={["F"]} />
          <Row label={t("help.title")} keys={["?"]} />
          <Row label={t("exit")} keys={["Esc"]} />
        </div>
      </div>
    </div>
  );
}
