import { useWhiteboardUiI18n } from "../ui-i18n";
import { Lock } from "lucide-react";
import { Button } from "@tau/ui";
import { ChromeBar } from "../chrome";

/** 文档版本过高时的只读提示条：不可关闭，宿主提供 onUpgradeApp 时展示就地升级入口（普通 readonly 不渲染） */
export default function ReadonlyNotice({ onUpgradeApp }: { onUpgradeApp?: () => void }) {
  const { t } = useWhiteboardUiI18n();
  return (
    <ChromeBar
      role="status"
      className="ease-tau-out top-3 left-1/2 h-[38px] -translate-x-1/2 gap-2 pr-2.5 pl-[11px] whitespace-nowrap transition-[opacity,translate] delay-[120ms] duration-200 select-none starting:-translate-y-1.5 starting:opacity-0 motion-reduce:starting:translate-y-0"
    >
      <Lock className="text-ink-2 size-[15px] shrink-0" strokeWidth={2} aria-hidden />
      <span className="text-tau-meta text-ink-1 font-medium">{t("ui.readonly")}</span>
      <span aria-hidden className="bg-ink-3/70 size-[3px] rounded-full" />
      <span className="text-tau-sm text-ink-3">{t("ui.readonlyHint")}</span>
      {onUpgradeApp && (
        <Button
          size="sm"
          variant="soft"
          className="h-6 rounded-[7px] px-2.5 text-[12px]"
          onClick={onUpgradeApp}
        >
          {t("ui.readonlyUpgrade")}
        </Button>
      )}
    </ChromeBar>
  );
}
