/**
 * 插件页：点「安装」先确认风险，再经过「下载校验中」变成「已安装」。
 * 从插件中心安装后直接启用，开关可随时停用。卡片、图标与安装按钮按 features/plugins 的 PluginsView、PluginIcon 与 PluginParts 重建。
 */
import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";
import { Switch, cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type Install = "none" | "confirm" | "downloading" | "installed";

interface Plugin {
  id: string;
  name: string;
  publisher: string;
  description: string;
  category: string;
  downloads: string;
  version: string;
  /** 图标底色，对应 PluginIcon 按插件 ID 取的 tag 色 */
  tone: string;
  install: Install;
  enabled: boolean;
}

const PLUGINS: Plugin[] = [
  {
    id: "weread",
    name: "微信读书",
    publisher: "tau",
    description: "同步微信读书书架、划线与想法，并在 Tau 中查看和引用摘录。",
    category: "页面",
    downloads: "3.2k",
    version: "1.0.13",
    tone: "bg-tag-2-soft text-tag-2",
    install: "none",
    enabled: false,
  },
  {
    id: "github",
    name: "GitHub Pages 发布",
    publisher: "tau",
    description: "通过 GitHub API 或 Git Push 发布博客到仓库分支。",
    category: "博客发布",
    downloads: "1.8k",
    version: "0.4.2",
    tone: "bg-tag-4-soft text-tag-4",
    install: "installed",
    enabled: true,
  },
  {
    id: "webdav",
    name: "WebDAV 存储",
    publisher: "tau",
    description: "使用 WebDAV 同步数据库或上传图片附件，账号按用途独立配置。",
    category: "同步",
    downloads: "2.4k",
    version: "0.3.3",
    tone: "bg-tag-3-soft text-tag-3",
    install: "none",
    enabled: false,
  },
];

export default function PluginsDemo() {
  const [plugins, setPlugins] = useState(PLUGINS);
  const update = (id: string, patch: Partial<Plugin>) =>
    setPlugins(list => list.map(plugin => (plugin.id === id ? { ...plugin, ...patch } : plugin)));

  useEffect(() => {
    const downloading = plugins.find(plugin => plugin.install === "downloading");
    if (!downloading) return;
    const timer = setTimeout(
      () => update(downloading.id, { install: "installed", enabled: true }),
      1400
    );
    return () => clearTimeout(timer);
  }, [plugins]);

  const confirming = plugins.find(plugin => plugin.install === "confirm");

  return (
    <AppWindow active="plugins" crumb="插件" height={400}>
      <div className="flex h-full flex-col px-7 pt-5 max-sm:px-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">插件</h3>
          <span className="text-tau-meta text-ink-2 max-sm:hidden">
            扩展页面、侧边栏、命令与摘录来源
          </span>
        </div>
        <div className="text-tau-sm mt-3 flex gap-4">
          <span className="text-ink-1 font-medium">发现</span>
          <span className="text-ink-3">
            已安装 {plugins.filter(plugin => plugin.install === "installed").length}
          </span>
          <span className="text-ink-3">更新 0</span>
        </div>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {plugins.map(plugin => {
            return (
              <div
                key={plugin.id}
                className="border-line-1 hover:shadow-lift flex min-h-[168px] flex-col gap-2 rounded-[var(--tau-radius-lg)] border p-4 transition-[box-shadow,border-color] hover:border-transparent"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-10 flex-none place-items-center rounded-[11px] text-[16px] font-semibold",
                      plugin.tone
                    )}
                  >
                    {plugin.name.slice(0, 1)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate text-[14px] font-semibold">{plugin.name}</b>
                    <span className="text-ink-3 text-[11.5px]">@{plugin.publisher}</span>
                  </span>
                  {plugin.install === "installed" && (
                    <Switch
                      size="sm"
                      checked={plugin.enabled}
                      aria-label={`启用「${plugin.name}」`}
                      onCheckedChange={enabled => update(plugin.id, { enabled })}
                    />
                  )}
                </div>
                <p className="text-ink-2 line-clamp-2 text-[12.5px] leading-[1.6]">
                  {plugin.description}
                </p>
                <span className="bg-hover text-ink-2 w-fit rounded-[5px] px-1.5 text-[11px] leading-5">
                  {plugin.category}
                </span>
                <div className="mt-auto flex items-center gap-2">
                  <span className="text-ink-3 text-[11.5px] tabular-nums">{plugin.version}</span>
                  <span className="text-ink-3 flex items-center gap-1 text-[11.5px]">
                    <Download className="size-3" strokeWidth={1.75} />
                    {plugin.downloads}
                  </span>
                  <span className="flex-1" />
                  {plugin.install === "installed" ? (
                    <span className="bg-ok-soft text-ok flex h-7 items-center gap-1 rounded-[8px] px-2.5 text-[12.5px]">
                      <Check className="size-3.5" strokeWidth={2} />
                      已安装
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={plugin.install === "downloading"}
                      onClick={() => update(plugin.id, { install: "confirm" })}
                      className={cn(
                        "border-line-1 h-7 rounded-[8px] border px-3 text-[12.5px] transition-colors",
                        plugin.install === "downloading" ? "text-ink-3" : "hover:bg-hover"
                      )}
                    >
                      {plugin.install === "downloading" ? "下载校验中…" : "安装"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {confirming && (
        <div className="bg-overlay animate-doc-in absolute inset-0 z-10 grid place-items-center p-4">
          <div className="bg-surface shadow-float w-[320px] rounded-[16px] p-5">
            <b className="text-tau-body font-semibold">
              安装「{confirming.name}」{confirming.version}？
            </b>
            <p className="text-ink-2 text-tau-sm mt-2 leading-relaxed">
              插件在完整应用环境中运行，可以读取和修改你的笔记数据。插件中心审核功能与来源，但不保证没有缺陷，请只安装你信任的插件。安装后即启用，可随时在「已安装」中停用。普通插件立即生效，编辑器和白板内容插件需重启应用后生效。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => update(confirming.id, { install: "none" })}
                className="text-ink-2 hover:bg-hover h-8 rounded-[8px] px-3 text-[13px]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => update(confirming.id, { install: "downloading" })}
                className="bg-accent text-ink-inverse hover:bg-accent-hover h-8 rounded-[8px] px-3 text-[13px] font-medium"
              >
                安装
              </button>
            </div>
          </div>
        </div>
      )}
    </AppWindow>
  );
}
