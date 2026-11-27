import { ArrowUpCircle } from "lucide-react";
import { Button, cn } from "@tau/ui";
import type { UpgradePromptRequest } from "@tau/shared/upgrade-prompt";
import { promptAppUpgrade } from "@/app/upgradePromptStore";
import { useUpgradePromptI18n } from "./i18n";

/**
 * 轻量内联升级触发入口：供非阻断状态条（协作不兼容、只读条等）原地呼出通用升级提示弹窗。
 */
export function UpgradeInlineAction({
  request,
  label,
  className,
}: {
  request: UpgradePromptRequest;
  label?: string;
  className?: string;
}) {
  const { t } = useUpgradePromptI18n();
  return (
    <Button
      size="sm"
      variant="soft"
      icon={ArrowUpCircle}
      className={cn("h-6 rounded-[7px] px-2.5 text-[12px]", className)}
      onClick={event => {
        event.stopPropagation();
        promptAppUpgrade(request);
      }}
    >
      {label ?? t("action.upgradeNow")}
    </Button>
  );
}
