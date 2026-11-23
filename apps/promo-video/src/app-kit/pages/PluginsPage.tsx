/**
 * 插件中心重建：结构摘自 features/plugins（views/PluginsView 发现页 / components/PluginParts 安装按钮各态 / PluginIcon / RestartBar）。
 * 只画「发现」页。目录条目、搜索词和每张卡的安装态由调用方给；搜索匹配 id、名称、简介、关键词，搜不到时是空态。
 * 从插件中心装的普通插件立即启用：卡片右上出开关、按钮位变「已安装」。只有内容插件才显示「重启后生效」和页顶的重启条。
 */
import clsx from "clsx";
import { BookOpen, Check, ChevronDown, Download, LayoutGrid, MoreHorizontal, RotateCw, Search, SearchX } from "lucide-react";
import { Button, IconButton } from "@tau/ui";
import { useCurrentFrame } from "remotion";
import { PLUGINS } from "../../mock/deepwork";
import { Pressed } from "../parts/Dialog";
import { InputLook, SwitchLook } from "../parts/FormLook";

export type InstallState = "available" | "installing" | "staged" | "installed";

export type CatalogPlugin = {
  id: string;
  name: string;
  version: string;
  desc: string;
  total: number;
  week: number;
  installed?: boolean;
  publisher?: string;
  categories?: string[];
  keywords?: string[];
};

/** 搜索：去首尾空格、不分大小写的子串，匹配任一字段 */
export const matchesQuery = (fields: (string | undefined)[], query: string) => {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some(field => field?.toLowerCase().includes(needle));
};

/** 首字图标，颜色按 id 哈希取 tag 槽（features/plugins/model.ts） */
export function PluginIcon({ id, name, size = "md" }: { id: string; name: string; size?: "sm" | "md" | "lg" }) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = (hash % 5) + 1;
  return (
    <span
      className={clsx(
        "grid flex-none place-items-center font-semibold",
        size === "sm" ? "size-8 rounded-[9px] text-[13.5px]" : size === "lg" ? "size-[60px] rounded-[16px] text-[24px]" : "size-10 rounded-[11px] text-[16px]"
      )}
      style={{ background: `var(--tau-tag-${tone}-soft)`, color: `var(--tau-tag-${tone})` }}
    >
      {[...name][0]}
    </span>
  );
}

export const CHIP = "text-tau-sm inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2";

function InstallButton({ state, version, hit, pressed }: { state: InstallState; version: string; hit: string; pressed?: boolean }) {
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
    <span data-hit={hit}>
      <Pressed on={!!pressed}>
        <Button variant="secondary" size="sm" icon={Download}>
          安装
        </Button>
      </Pressed>
    </span>
  );
}

function CategoryTags({ categories }: { categories?: string[] }) {
  if (!categories?.length) return null;
  return (
    <ul aria-label="分类" className="flex flex-wrap gap-1.5">
      {categories.map(category => (
        <li key={category} className="flex">
          <span className="text-tau-sm bg-tag-5-soft text-tag-5 inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full px-[9px] leading-none">{category}</span>
        </li>
      ))}
    </ul>
  );
}

function CatalogCard({ plugin, state, pressed, cardPressed }: { plugin: CatalogPlugin; state: InstallState; pressed?: boolean; cardPressed?: boolean }) {
  return (
    <article
      data-hit={`card:${plugin.id}`}
      className={clsx(
        "border-line-1 ease-tau-out hover:shadow-lift flex min-h-[168px] cursor-pointer flex-col gap-2.5 rounded-[var(--tau-radius-lg)] border p-4 transition-[box-shadow,border-color] duration-200 hover:border-transparent",
        cardPressed && "shadow-lift border-transparent"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <PluginIcon id={plugin.id} name={plugin.name} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">{plugin.name}</div>
          <div className="text-tau-sm text-ink-3 truncate">@{plugin.publisher ?? PLUGINS.publisher}</div>
        </div>
        {state === "installed" && (
          <span className="ml-auto flex-none">
            <SwitchLook checked size="sm" />
          </span>
        )}
      </div>
      <p className="text-tau-meta text-ink-2 line-clamp-2">{plugin.desc}</p>
      <CategoryTags categories={plugin.categories} />
      <div className="text-tau-sm text-ink-3 mt-auto flex items-center gap-2">
        <span className="tabular-nums">{plugin.version}</span>
        <span className="flex items-center gap-1 tabular-nums">
          <Download className="size-3.5" strokeWidth={1.75} aria-hidden />
          {plugin.total.toLocaleString("en-US")}
        </span>
        <span className="ml-auto">
          <InstallButton state={state} version={plugin.version} hit={`install:${plugin.id}`} pressed={pressed} />
        </span>
      </div>
    </article>
  );
}

export function PluginsPage({
  plugins = PLUGINS.list,
  query = "",
  states = {},
  pressed = {},
  installedCount,
  restartBar = 0,
  pressRestart,
}: {
  /** 目录条目（已按排序排好） */
  plugins?: CatalogPlugin[];
  /** 搜索框里的字 */
  query?: string;
  /** 各卡的安装态；没给的看条目自带的 installed */
  states?: Record<string, InstallState>;
  /** 正被点按的元素 */
  pressed?: { install?: string; card?: string; search?: boolean };
  /** 页签「已安装 N」；缺省 = 原有数量 + 装好的 */
  installedCount?: number;
  restartBar?: number;
  pressRestart?: boolean;
}) {
  const count = installedCount ?? PLUGINS.installedCount + plugins.filter(p => states[p.id] === "installed").length;
  const entries = plugins.filter(plugin => matchesQuery([plugin.id, plugin.name, plugin.desc, ...(plugin.keywords ?? [])], query));
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          <div className="flex h-10 items-center gap-3">
            <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em]">插件</h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate">扩展页面、侧边栏、命令与摘录来源</span>
            <Button variant="ghost" size="sm" icon={LayoutGrid}>
              全部分类
              <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
            </Button>
            <span className="border-line-1 bg-surface text-ink-1 rounded-tau-sm text-tau-sm inline-flex h-[28px] shrink-0 items-center gap-2 border pr-[3px] pl-2.5">
              <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">最近热门</span>
              <ChevronDown className="text-ink-3 size-4 shrink-0" strokeWidth={1.75} />
            </span>
            <span data-hit="search">
              <InputLook size="sm" lead={Search} value={query} placeholder="搜索插件" focused={pressed.search} className="w-[240px]" />
            </span>
            <IconButton>
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </IconButton>
          </div>
          <div className="mt-3 flex gap-[22px]">
            {["发现", `已安装 ${count}`, "更新"].map((tab, i) => (
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
                  <b className="font-semibold">1 项变更</b>涉及内容插件的变更将在重启后生效。
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
          {entries.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
              {entries.map(plugin => (
                <CatalogCard
                  key={plugin.id}
                  plugin={plugin}
                  state={states[plugin.id] ?? (plugin.installed ? "installed" : "available")}
                  pressed={pressed.install === plugin.id}
                  cardPressed={pressed.card === plugin.id}
                />
              ))}
            </div>
          ) : (
            <div className="text-tau-meta text-ink-2 flex flex-col items-center gap-1.5 px-5 py-16 text-center [&>span>svg]:size-6">
              <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
                <SearchX strokeWidth={1.75} />
              </span>
              <p className="text-ink-1 text-[15px] font-semibold">没有找到「{query.trim()}」</p>
              <p>想要的功能可以自己做一个。</p>
              <Button variant="ghost" size="sm" icon={BookOpen} className="mt-2">
                查看开发文档
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
