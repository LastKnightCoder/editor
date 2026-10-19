/**
 * 插件中心重建：结构摘自 features/plugins（views/PluginsView 发现页 / components/PluginParts 安装按钮各态 / PluginIcon / RestartBar）。
 * 只画「发现」页；install 为微信读书那张卡的安装态：available → installing（下载校验中）→ staged（重启后生效）→ installed。
 * 从插件中心装的插件要重启才生效，staged 时页顶出现「N 项变更 · 立即重启」。
 */
import clsx from "clsx";
import { ArrowDownUp, Check, ChevronDown, Download, MoreHorizontal, RotateCw, Search } from "lucide-react";
import { Button, IconButton } from "@tau/ui";
import { useCurrentFrame } from "remotion";
import { PLUGINS } from "../../mock/deepwork";
import { Pressed } from "../parts/Dialog";
import { InputLook } from "../parts/FormLook";

export type InstallState = "available" | "installing" | "staged" | "installed";

/** 首字图标，颜色按 id 哈希取 tag 槽（features/plugins/model.ts） */
function iconTone(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 5) + 1;
}

export function PluginIcon({ id, name, size = "md" }: { id: string; name: string; size?: "sm" | "md" | "lg" }) {
  const n = iconTone(id);
  return (
    <span
      className={clsx(
        "grid flex-none place-items-center font-semibold",
        size === "sm" ? "size-8 rounded-[9px] text-[13.5px]" : size === "lg" ? "size-[60px] rounded-[16px] text-[24px]" : "size-10 rounded-[11px] text-[16px]"
      )}
      style={{ background: `var(--tau-tag-${n}-soft)`, color: `var(--tau-tag-${n})` }}
    >
      {[...name][0]}
    </span>
  );
}

const CHIP = "text-tau-sm inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2";

function InstallButton({ state, version, pressed }: { state: InstallState; version: string; pressed?: boolean }) {
  const spin = useCurrentFrame() * 8;
  if (state === "installed")
    return (
      <span className={clsx(CHIP, "bg-ok-soft text-ok")}>
        <Check className="size-3" strokeWidth={2} />
        已安装
      </span>
    );
  if (state === "staged")
    return (
      <span className={clsx(CHIP, "bg-accent-soft text-accent-text")}>
        <RotateCw className="size-3" strokeWidth={1.75} />
        {version} 重启后生效
      </span>
    );
  if (state === "installing")
    return (
      <Button variant="secondary" size="sm">
        <span className="inline-block size-[13px] rounded-full border-2 border-current/30 border-t-current" style={{ transform: `rotate(${spin}deg)` }} />
        下载校验中
      </Button>
    );
  return (
    <Pressed on={!!pressed}>
      <Button variant="secondary" size="sm" icon={Download}>
        安装
      </Button>
    </Pressed>
  );
}

export function PluginsPage({ install = "available", pressInstall, restartBar = 0, pressRestart }: { install?: InstallState; pressInstall?: boolean; restartBar?: number; pressRestart?: boolean }) {
  const installed = PLUGINS.installedCount + (install === "installed" ? 1 : 0);
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          <div className="flex h-10 items-center gap-3">
            <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em]">插件</h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate">扩展页面、侧边栏、命令与摘录来源</span>
            <Button variant="ghost" size="sm" icon={ArrowDownUp}>
              最近热门
              <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
            </Button>
            <InputLook size="sm" lead={Search} placeholder="搜索插件" className="w-[240px]" />
            <IconButton>
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </IconButton>
          </div>
          <div className="mt-3 flex gap-[22px]">
            {["发现", `已安装 ${installed}`, "更新"].map((tab, i) => (
              <span
                key={tab}
                className={clsx(
                  "text-tau-body relative inline-flex items-center gap-1.5 pt-1 pb-[7px]",
                  i === 0 ? "text-ink-1 after:bg-accent font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full" : "text-ink-2"
                )}
              >
                {tab}
              </span>
            ))}
          </div>
          {restartBar > 0 && (
            <div className="overflow-hidden" style={{ height: 48 * restartBar, opacity: restartBar }}>
              <div className="bg-accent-soft text-accent-text text-tau-meta mt-2 flex items-center gap-3 rounded-[var(--tau-radius-md)] px-3.5 py-2.5">
                <RotateCw className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <b className="font-semibold">1 项变更</b>将在重启后生效。安装失败会保留旧版本。
                </span>
                <Pressed on={!!pressRestart}>
                  <Button variant="primary" size="sm">
                    立即重启
                  </Button>
                </Pressed>
              </div>
            </div>
          )}
        </div>
        <div className="mb-4 min-h-0 flex-1 overflow-hidden pt-4 pr-[26px] pb-2 pl-8">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
            {PLUGINS.list.map(plugin => {
              const state: InstallState = plugin.id === "weread" ? install : plugin.installed ? "installed" : "available";
              return (
                <article key={plugin.id} className="border-line-1 flex min-h-[168px] flex-col gap-2.5 rounded-[var(--tau-radius-lg)] border p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <PluginIcon id={plugin.id} name={plugin.name} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{plugin.name}</div>
                      <div className="text-tau-sm text-ink-3 truncate">@{PLUGINS.publisher}</div>
                    </div>
                  </div>
                  <p className="text-tau-meta text-ink-2 line-clamp-2">{plugin.desc}</p>
                  <div className="text-tau-sm text-ink-3 tabular-nums">
                    累计 {plugin.total.toLocaleString("en-US")} 次 · 近 7 日 {plugin.week} 次
                  </div>
                  <div className="text-tau-sm text-ink-3 mt-auto flex items-center gap-2">
                    <span className="tabular-nums">{plugin.version}</span>
                    <span className="ml-auto">
                      <InstallButton state={state} version={plugin.version} pressed={plugin.id === "weread" && pressInstall} />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
