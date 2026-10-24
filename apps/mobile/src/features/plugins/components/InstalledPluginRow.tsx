import { ChevronRight } from "lucide-react";
import { Switch, cn } from "@tau/ui";
import { PluginIcon } from "./PluginIcon";
import { STATUS_DISPLAY, TONE_CLASS, type PluginLifecycleView } from "./pluginStatus";

/** 已安装列表行：状态 + 版本 + 启停开关；管理动作统一在详情页，整行（开关除外）进详情。 */
export function InstalledPluginRow({
  id,
  name,
  version,
  status,
  update,
  enabled,
  toggle,
  divider,
  onOpen,
  onToggle,
}: {
  id: string;
  name: string;
  version: string | null;
  status: PluginLifecycleView;
  /** 中心有更高的兼容版本时的版本号 */
  update: string | null;
  enabled: boolean;
  /** null 表示当前不可切换（无管理权限、操作进行中等） */
  toggle: { allowed: boolean } | null;
  divider: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const display = STATUS_DISPLAY[status.kind];
  return (
    <li className="relative flex items-center gap-3 py-3 pl-3.5 pr-3.5" data-plugin-id={id}>
      {divider && (
        <span aria-hidden className="bg-line-2 absolute left-[70px] right-0 top-0 h-px" />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
      >
        <PluginIcon id={id} name={name} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-ink-1 truncate text-[15px] font-semibold">{name}</span>
          <span className="text-ink-3 flex min-w-0 items-center gap-1.5 text-[11.5px]">
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold",
                TONE_CLASS[display.tone]
              )}
            >
              {display.label}
              {status.kind === "pending" && status.version && ` v${status.version}`}
            </span>
            {update && (
              <span className="bg-accent-soft text-accent-text shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold">
                可更新 {update}
              </span>
            )}
            {version && <span className="truncate">v{version}</span>}
          </span>
        </span>
      </button>
      {toggle ? (
        <Switch
          aria-label={`${enabled ? "停用" : "启用"} ${name}`}
          checked={enabled}
          disabled={!toggle.allowed}
          onCheckedChange={onToggle}
        />
      ) : (
        <ChevronRight size={18} className="text-ink-3 shrink-0" aria-hidden />
      )}
    </li>
  );
}
