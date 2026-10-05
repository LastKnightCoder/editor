/**
 * 关于与更新 —— 定稿初版（2026-09-24，mockups/settings/index.html 第三版「关于与更新」）。
 *
 * 移植 legacy AppAbout（数据库管理已迁到「同步 · 本地数据库」Tab）：
 * - 顶部应用卡：图标 / 名称 / 版本 + 更新状态签与对应动作（检查 / 下载 / 重启并安装），
 *   下载中显示进度条，有可用更新或出错时提供「手动下载」外链；状态全部来自 useUpdateStore
 *   （主进程事件由全局 AutoUpdateChecker 挂载，本页只读状态与触发动作）
 * - 更新：自动检查更新开关（misc.update.autoCheck）
 * - 命令行工具：tau 命令安装状态与安装 / 卸载；legacy 无平台判定、取状态失败即视为不可用，
 *   这里同样以取状态成功为渲染条件
 */

import { useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw, RotateCw, Terminal } from "lucide-react";
import { Button, Panel, Switch, toast } from "@tau/ui";
import logo from "@/assets/logo.png";
import useSettingStore from "@/stores/useSettingStore";
import { useUpdateStore, type UpdateStatus } from "@/stores/useUpdateStore";
import { getCliStatus, getVersions, installCli, openExternal, uninstallCli } from "@/commands";
import { platform } from "@/platform";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [versionError, setVersionError] = useState(false);
  const [cli, setCli] = useState<{ installed: boolean; path: string } | null>(null);
  const [cliLoading, setCliLoading] = useState(false);

  const status = useUpdateStore(s => s.status);
  const newVersion = useUpdateStore(s => s.newVersion);
  const fallbackUrl = useUpdateStore(s => s.fallbackUrl);
  const progress = useUpdateStore(s => s.progress);
  const errorMessage = useUpdateStore(s => s.errorMessage);
  const autoCheck = useSettingStore(s => s.setting.misc.update.autoCheck);
  const setAutoCheck = useSettingStore(s => s.setAutoCheckUpdate);

  const refreshCli = async () => {
    try {
      setCli(await getCliStatus());
    } catch {
      /* 命令行工具不可用：不渲染入口 */
    }
  };

  useEffect(() => {
    getVersions()
      .then(v => setVersion(v.app))
      .catch(() => setVersionError(true));
    void refreshCli();
    /* 与 legacy 一致：进入本页时若尚未检查过，则检查一次 */
    if (useUpdateStore.getState().status === "idle") void useUpdateStore.getState().check();
  }, []);

  const runCli = async (action: "install" | "uninstall") => {
    setCliLoading(true);
    const verb = action === "install" ? "安装" : "卸载";
    try {
      const result = action === "install" ? await installCli() : await uninstallCli();
      if (result.success) {
        await refreshCli();
        toast.success(
          action === "uninstall"
            ? "命令行工具已卸载"
            : platform.os === "win32"
              ? "命令行工具安装成功，请打开新的终端窗口使用 tau 命令"
              : "命令行工具安装成功，可以在终端使用 tau 命令"
        );
      } else {
        toast.error(`${verb}失败：${result.error}`);
      }
    } catch (error) {
      toast.error(`${verb}失败：${errorText(error)}`);
    } finally {
      setCliLoading(false);
    }
  };

  const percent = Math.round(progress);
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
                  下载更新
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

      <SettingsGroup title="更新">
        <SettingRow title="自动检查更新" description="启动时在后台检查，有新版本在这里提示">
          <Switch aria-label="自动检查更新" checked={autoCheck} onCheckedChange={setAutoCheck} />
        </SettingRow>
      </SettingsGroup>

      {cli && (
        <SettingsGroup
          title="命令行工具"
          description="把 tau 命令装到系统 PATH，可在终端管理卡片与同步数据库"
        >
          <SettingRow
            title={
              <span className="inline-flex items-center gap-2">
                <Terminal size={15} strokeWidth={1.75} className="text-ink-2" />
                tau 命令
                {cli.installed ? (
                  <StatusChip tone="ok">已安装</StatusChip>
                ) : (
                  <StatusChip>未安装</StatusChip>
                )}
              </span>
            }
            description={
              cli.installed && cli.path ? (
                <span className="font-tau-mono break-all">{cli.path}</span>
              ) : (
                "安装后在终端使用 tau 命令"
              )
            }
          >
            {cli.installed ? (
              <Button
                variant="danger-soft"
                size="sm"
                loading={cliLoading}
                onClick={() => void runCli("uninstall")}
              >
                卸载
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon={Terminal}
                loading={cliLoading}
                onClick={() => void runCli("install")}
              >
                安装
              </Button>
            )}
          </SettingRow>
        </SettingsGroup>
      )}

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

/** 白板手绘模式的内置字体（D-106） */
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
