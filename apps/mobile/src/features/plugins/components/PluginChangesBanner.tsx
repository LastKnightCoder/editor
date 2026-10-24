import { LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { useMobilePluginStatus } from "../../../app/plugins/context";

/**
 * 插件中心顶部的会话横幅：启动中显示进度；有已保存未生效的变更（待生效包、启停）时提供「立即生效」，
 * 即重建插件会话而不重启应用；安全模式提供重新加载。
 */
export function PluginChangesBanner({ changes }: { changes: readonly string[] }) {
  const { phase, reload } = useMobilePluginStatus();
  if (phase === "starting")
    return (
      <div
        role="status"
        className="bg-surface text-ink-2 flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-[13px]"
      >
        <LoaderCircle size={16} className="text-accent animate-spin" aria-hidden />
        插件加载中…
      </div>
    );
  const safe = phase === "safe";
  if (!safe && !changes.length) return null;
  return (
    <div className="bg-warn-soft flex items-center gap-2.5 rounded-[14px] px-3 py-2.5">
      {safe ? (
        <ShieldAlert size={18} className="text-warn shrink-0" aria-hidden />
      ) : (
        <RefreshCw size={18} className="text-warn shrink-0" aria-hidden />
      )}
      <span className="text-ink-1 min-w-0 flex-1 text-[13px] leading-snug">
        {safe ? "已跳过插件（安全模式）" : `${changes.length} 个插件变更等待生效`}
        <span className="text-ink-2 block truncate text-[11.5px]">
          {safe ? "停用问题插件后重新加载" : changes.join("、")}
        </span>
      </span>
      <button
        type="button"
        onClick={reload}
        className="bg-ink-1 text-ink-inverse h-[30px] shrink-0 rounded-full px-3 text-[12.5px] font-bold active:scale-95"
      >
        {safe ? "重新加载" : "立即生效"}
      </button>
    </div>
  );
}
