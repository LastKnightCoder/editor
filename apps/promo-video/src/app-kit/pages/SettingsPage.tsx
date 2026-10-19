/**
 * 设置页重建：结构摘自 features/settings（SettingsScreen 框架 / sections.tsx 导航与页头 / SettingsGroup / SettingRow / SettingsNote /
 * sections/LocalDatabasePanel 本地数据库 / sections/TransferSection 导入与导出）。
 * 设置页是铺满窗口的壳层浮层（不是主侧栏换页），自带左侧导航与红绿灯；视频里放在窗口内铺满，appear 为 160ms 的淡入。
 */
import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import { Archive, ArrowLeft, ArrowLeftRight, ArrowRight, AudioLines, ChevronDown, HardDrive, Image as ImageIcon, Info, Layers, Palette, Plug, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Button, Panel } from "@tau/ui";
import { Pressed } from "../parts/Dialog";

const NAV = [
  { group: "通用", items: [{ icon: Palette, label: "外观" }] },
  {
    group: "数据",
    items: [
      { icon: RefreshCw, label: "同步" },
      { icon: HardDrive, label: "资源存储" },
      { icon: Archive, label: "剪藏与缓存" },
      { icon: ArrowLeftRight, label: "导入与导出" },
    ],
  },
  { group: "连接", items: [{ icon: Plug, label: "账号与连接" }] },
  {
    group: "AI 服务",
    items: [
      { icon: Sparkles, label: "大语言模型" },
      { icon: Layers, label: "嵌入模型" },
      { icon: ImageIcon, label: "图片生成" },
      { icon: AudioLines, label: "语音" },
    ],
  },
  { group: "系统", items: [{ icon: Info, label: "关于与更新" }] },
];

const HEADER: Record<string, string> = {
  同步: "把数据库和本地资源文件同步到远端，全部手动触发",
  导入与导出: "从其它笔记工具迁入，或把内容连同图片打包带走",
};

const ROW_DIVIDER = "relative [&+&]:before:border-line-2 [&+&]:before:absolute [&+&]:before:inset-x-3 [&+&]:before:top-0 [&+&]:before:border-t";
const NAV_ROW = "text-tau-body flex h-[calc(1.65em+8px)] w-full items-center rounded-[10px] text-left";

export function SettingsGroup({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="mb-7 last:mb-0">
      <div className="flex items-end gap-3 px-1 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-tau-body-lg text-ink-1 font-semibold">{title}</h3>
          <p className="text-tau-meta text-ink-2">{desc}</p>
        </div>
      </div>
      <Panel pad="none" className="rounded-[14px] p-1.5">
        {children}
      </Panel>
    </section>
  );
}

export function SettingRow({ title, desc, children }: { title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className={clsx("rounded-tau-sm flex min-h-14 items-center gap-4 px-3 py-[11px]", ROW_DIVIDER)}>
      <div className="min-w-0 flex-1">
        <div className="text-tau-body-lg text-ink-1 leading-snug font-medium">{title}</div>
        {desc && <div className="text-tau-meta text-ink-2 mt-0.5 leading-normal">{desc}</div>}
      </div>
      {children && <div className="flex flex-none items-center gap-2">{children}</div>}
    </div>
  );
}

/** 设置页框架：左侧导航 + 右侧页头与内容；pressedNav 为正被点按的导航条目 */
export function SettingsScreen({ active, pressedNav, appear = 1, children }: { active: string; pressedNav?: string; appear?: number; children: ReactNode }) {
  return (
    <div className="bg-page absolute inset-0 z-[90] grid grid-cols-[220px_minmax(0,1fr)] overflow-hidden" style={{ opacity: appear, borderRadius: 14, "--tau-titlebar-h": "46px" } as CSSProperties}>
      <nav className="flex min-h-0 flex-col px-2.5 pb-3">
        <div className="flex h-[var(--tau-titlebar-h)] shrink-0 items-center px-1.5">
          <div className="flex items-center gap-2 pr-1">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
        </div>
        <div className={clsx(NAV_ROW, "text-ink-2 mb-1.5 gap-2.5 px-2.5")}>
          <ArrowLeft className="shrink-0" size="1.06em" strokeWidth={1.75} />
          <span className="min-w-0 truncate">返回应用</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {NAV.map(group => (
            <div key={group.group} className="mt-3">
              <div className="text-tau-tiny text-ink-3 px-2.5 pb-1.5">{group.group}</div>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <div
                    key={item.label}
                    className={clsx(NAV_ROW, "gap-2.5 px-2.5", item.label === active ? "bg-selected text-ink-1 font-medium" : item.label === pressedNav ? "bg-hover text-ink-1" : "text-ink-2")}
                  >
                    <item.icon className="shrink-0" size="1.06em" strokeWidth={1.75} />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
      <div className="grid min-h-0 min-w-0 grid-rows-[var(--tau-titlebar-h)_minmax(0,1fr)]">
        <div />
        <div className="mr-1.5 min-h-0 overflow-hidden">
          <div className="mx-auto w-full max-w-[880px] px-10 pt-6 pb-16">
            <header className="mb-7">
              <h1 className="text-tau-title-lg text-ink-1 font-semibold">{active}</h1>
              <p className="text-tau-meta text-ink-2 mt-1">{HEADER[active] ?? ""}</p>
            </header>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 同步 › 本地数据库：当前数据库的真实路径（~/.editor/data.db 的绝对路径） */
export function LocalDatabaseSection({ path }: { path: string }) {
  return (
    <>
      <div className="-mt-2 mb-6 flex gap-[22px]">
        {["概览", "资源文件", "本地数据库"].map((tab, i) => (
          <span
            key={tab}
            className={clsx(
              "text-tau-body relative inline-flex items-center gap-1.5 pt-1 pb-[7px]",
              i === 2 ? "text-ink-1 after:bg-accent font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full" : "text-ink-2"
            )}
          >
            {tab}
          </span>
        ))}
      </div>
      <SettingsGroup title="当前数据库" desc="为不同用途维护独立的数据空间">
        <SettingRow title="数据库" desc={<span className="font-tau-mono break-all">{path}</span>}>
          <span className="border-line-1 bg-surface text-ink-1 rounded-tau-sm text-tau-body inline-flex h-[34px] w-[200px] items-center gap-2 border pr-[5px] pl-3">
            <span className="min-w-0 flex-1 truncate">data</span>
            <ChevronDown className="text-ink-3 size-4 shrink-0" />
          </span>
        </SettingRow>
        <SettingRow title="新建数据库" desc="名称会自动保存为 .db 文件，创建后设为当前">
          <Button variant="secondary" size="sm" icon={Plus}>
            新建
          </Button>
        </SettingRow>
      </SettingsGroup>
      <p className="text-tau-meta text-ink-2 mb-7 flex items-center gap-2 px-1 last:mb-0">
        <span className="text-ink-3 flex-none">
          <Info size={14} strokeWidth={1.75} />
        </span>
        <span className="min-w-0">拉取远程数据库前，原文件会自动备份到 backup 文件夹</span>
      </p>
    </>
  );
}

/** 导入与导出：「导出为 Markdown 压缩包 · 选择范围」打开导出弹窗 */
export function TransferSection({ pressExport }: { pressExport?: boolean }) {
  return (
    <>
      <SettingsGroup title="导入" desc="正文引用的本地图片与附件一并导入，存放到当前资源存储">
        <SettingRow title="导入文件夹或压缩包" desc="导入为项目（保持目录树）、文章或卡片；文档之间的 .md 链接转为应用内链接，导入前可预览">
          <Button variant="secondary" size="sm" icon={ArrowRight}>
            选择来源
          </Button>
        </SettingRow>
        <SettingRow title="导入 Markdown 文件" desc="卡片页、文章页的「导入」，或项目文档树的「导入 Markdown」；相对路径按 .md 所在目录解析" />
      </SettingsGroup>
      <SettingsGroup title="导出" desc="本地图片、音视频和附件随文件打包，引用改为相对路径">
        <SettingRow title="导出为 Markdown 压缩包" desc="项目、文章、卡片或全部内容；互链可写成相对 .md 或 [[文件名]]，可附 frontmatter">
          <Pressed on={!!pressExport}>
            <Button variant="secondary" size="sm" icon={ArrowRight}>
              选择范围
            </Button>
          </Pressed>
        </SettingRow>
        <SettingRow title="导出为 PDF / EPUB" desc="在项目列表的卡片 ⋯ 菜单中选「整体导出」，按文档树排版成书" />
        <SettingRow title="导出单篇" desc="卡片、文章、项目文档的「导出 › Markdown 文件」：有本地资源时导出为 .zip（含 assets/）" />
      </SettingsGroup>
    </>
  );
}
