/**
 * 关于与更新 —— 定稿初版（2026-09-24，mockups/settings/index.html 第三版「关于与更新」）。
 *
 * 移植 legacy AppAbout（数据库管理已迁到「同步 · 本地数据库」Tab）：
 * - 顶部应用卡：图标 / 名称 / 版本 + 更新状态签与对应动作（检查 / 重启并安装），
 *   检测到新版本即在后台自动下载，下载中显示进度条，就绪后一键重启安装；
 *   出错或需要手动获取时提供「手动下载」外链；
 *   状态全部来自 useUpdateStore（主进程事件由全局 AutoUpdateChecker 挂载，本页只读状态与触发动作）
 * - 有可用更新时在「更新」组提供新版本内容入口，经弹窗展示跨越版本的公告（来自 latest*.yml）
 * - 更新：自动检查更新开关（misc.update.autoCheck）；本版更新内容（安装包内置公告）
 */

import { useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw, RotateCw } from "lucide-react";
import { Button, Panel, Switch } from "@tau/ui";
import logo from "@/assets/logo.png";
import useSettingStore from "@/stores/useSettingStore";
import { useUpdateStore, type UpdateStatus } from "@/stores/useUpdateStore";
import { getVersions, openExternal } from "@/commands";
import { bundledNotesBetween } from "@/features/release-notes/notes";
import { useReleaseNotesStore } from "@/features/release-notes/releaseNotesStore";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";
import { BackgroundGroup } from "./BackgroundGroup";

export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [versionError, setVersionError] = useState(false);

  const status = useUpdateStore(s => s.status);
  const newVersion = useUpdateStore(s => s.newVersion);
  const fallbackUrl = useUpdateStore(s => s.fallbackUrl);
  const progress = useUpdateStore(s => s.progress);
  const errorMessage = useUpdateStore(s => s.errorMessage);
  const releaseNotes = useUpdateStore(s => s.releaseNotes);
  const autoCheck = useSettingStore(s => s.setting.misc.update.autoCheck);
  const setAutoCheck = useSettingStore(s => s.setAutoCheckUpdate);

  useEffect(() => {
    getVersions()
      .then(v => setVersion(v.app))
      .catch(() => setVersionError(true));
    /* 与 legacy 一致：进入本页时若尚未检查过，则检查一次 */
    if (useUpdateStore.getState().status === "idle") void useUpdateStore.getState().check();
  }, []);

  const percent = Math.round(progress);
  const currentNotes = version ? bundledNotesBetween(null, version) : [];
  const showFallback = (status === "available" || status === "error") && !!fallbackUrl;

  return (
    <>
      <SettingsGroup bare>
        <Panel pad="none" className="rounded-[14px] px-4 py-3.5">
          <div className="flex items-center gap-4">
            <img
              src={logo}
              alt="Tau"
              draggable={false}
              className="size-[52px] shrink-0 select-none mix-blend-multiply dark:mix-blend-normal dark:brightness-[0.85]"
            />
            <div className="min-w-0">
              <div className="text-tau-body-lg text-ink-1 font-semibold">Tau</div>
              <div className="font-tau-mono text-tau-meta text-ink-2">
                {versionError ? "获取版本失败" : version ? `v${version}` : "加载中…"}
              </div>
            </div>
            <div className="ml-auto flex flex-none items-center gap-2">
              <UpdateChip status={status} newVersion={newVersion} percent={percent} />
              {showFallback && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ExternalLink}
                  onClick={() => fallbackUrl && void openExternal(fallbackUrl)}
                >
                  手动下载
                </Button>
              )}
              {status === "available" ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={Download}
                  onClick={() => void useUpdateStore.getState().download()}
                >
                  立即更新
                </Button>
              ) : status === "ready" ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={RotateCw}
                  onClick={() => void useUpdateStore.getState().install()}
                >
                  重启并安装
                </Button>
              ) : status === "downloading" ? null : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  loading={status === "checking"}
                  loadingText="检查中…"
                  onClick={() => void useUpdateStore.getState().check()}
                >
                  检查更新
                </Button>
              )}
            </div>
          </div>
          {status === "downloading" && (
            <div className="bg-sunken mt-3.5 h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-accent h-full rounded-full transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
          {status === "error" && (
            <div className="text-tau-meta text-ink-2 mt-2.5">{errorMessage ?? "检查更新失败"}</div>
          )}
        </Panel>
      </SettingsGroup>

      <BackgroundGroup />
      <SettingsGroup title="更新">
        <SettingRow title="自动检查更新" description="启动时在后台检查并自动下载新版本">
          <Switch aria-label="自动检查更新" checked={autoCheck} onCheckedChange={setAutoCheck} />
        </SettingRow>
        {releaseNotes.length > 0 && (
          <SettingRow title="新版本更新内容" description={`v${releaseNotes[0].version} 带来的变化`}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => useReleaseNotesStore.getState().show(releaseNotes)}
            >
              查看
            </Button>
          </SettingRow>
        )}
        {currentNotes.length > 0 && (
          <SettingRow title="本版更新内容" description={`v${version} 带来的变化`}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => useReleaseNotesStore.getState().show(currentNotes)}
            >
              查看
            </Button>
          </SettingRow>
        )}
      </SettingsGroup>

      {/* 内置字体为 SIL OFL-1.1，许可要求随软件保留版权与许可声明（原文随安装包附在字体目录） */}
      <SettingsGroup title="开源字体">
        {BUNDLED_FONTS.map(font => (
          <SettingRow key={font.name} title={font.name} description={font.credit}>
            <Button
              variant="ghost"
              size="sm"
              icon={ExternalLink}
              onClick={() => openExternal(font.url)}
            >
              SIL OFL 1.1
            </Button>
          </SettingRow>
        ))}
      </SettingsGroup>
    </>
  );
}

/** 白板手绘模式的内置字体（D-107） */
const BUNDLED_FONTS = [
  {
    name: "Shantell Sans",
    credit: "白板手绘模式的英文字体 · © 2022 The Shantell Sans Project Authors",
    url: "https://github.com/arrowtype/shantell-sans",
  },
  {
    name: "小赖字体 Xiaolai SC",
    credit: "白板手绘模式的中文字体 · © 2020-2024 LXGW，© 2014 Nozomi Seto",
    url: "https://github.com/lxgw/kose-font",
  },
];

function UpdateChip({
  status,
  newVersion,
  percent,
}: {
  status: UpdateStatus;
  newVersion: string | null;
  percent: number;
}) {
  switch (status) {
    case "checking":
      return <StatusChip tone="accent">检查中</StatusChip>;
    case "upToDate":
      return <StatusChip tone="ok">已是最新</StatusChip>;
    case "available":
      return <StatusChip tone="accent">v{newVersion} 可更新</StatusChip>;
    case "downloading":
      return <StatusChip tone="accent">正在下载 {percent}%</StatusChip>;
    case "ready":
      return <StatusChip tone="ok">v{newVersion} 已就绪，重启后安装</StatusChip>;
    case "error":
      return <StatusChip tone="danger">更新失败</StatusChip>;
    default:
      return <StatusChip>尚未检查</StatusChip>;
  }
}
