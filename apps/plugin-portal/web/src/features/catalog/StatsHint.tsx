import { Info } from "lucide-react";
import { Tooltip } from "@tau/ui";

export const STATS_NOTE =
  "仅统计插件中心提供的 ZIP，按匿名设备、版本和 UTC 日去重；近 7 日含今日。数量从统计上线起累计，不代表安装人数。";

/** 下载统计口径说明，收进提示里而不是铺在列表上 */
export function StatsHint() {
  return (
    <Tooltip content={<span className="block max-w-[280px]">{STATS_NOTE}</span>}>
      <button
        type="button"
        aria-label="下载统计口径"
        className="text-ink-3 hover:text-ink-1 inline-grid size-5 place-items-center rounded-full transition-colors"
      >
        <Info size={14} />
      </button>
    </Tooltip>
  );
}
