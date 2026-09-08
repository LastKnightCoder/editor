import { useState, memo } from "react";
import { useAsyncEffect } from "ahooks";
import { App, Progress } from "antd";
import { getVersions, openExternal } from "@/commands";
import { invoke } from "@/electron";
import SelectDatabase from "@/components/SelectDatabase";
import { SettingButton, SettingContainer, SettingSection, SettingSwitch } from "../components";
import { useUpdateStore } from "@/stores/useUpdateStore";
import useSettingStore from "@/stores/useSettingStore";

const AppAbout = memo(() => {
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState("0.0");
  const [fetchVersionError, setFetchVersionError] = useState(false);
  const [cliInstalled, setCliInstalled] = useState(false);
  const [cliPath, setCliPath] = useState("");
  const [cliLoading, setCliLoading] = useState(false);
  const { message } = App.useApp();

  const updateStatus = useUpdateStore(state => state.status);
  const updateNewVersion = useUpdateStore(state => state.newVersion);
  const updateFallbackUrl = useUpdateStore(state => state.fallbackUrl);
  const updateProgress = useUpdateStore(state => state.progress);
  const updateError = useUpdateStore(state => state.errorMessage);
  const checkUpdate = useUpdateStore(state => state.check);
  const downloadUpdate = useUpdateStore(state => state.download);
  const installUpdate = useUpdateStore(state => state.install);
  const autoCheckUpdate = useSettingStore(state => state.setting.misc.update.autoCheck);
  const setAutoCheckUpdate = useSettingStore(state => state.setAutoCheckUpdate);

  useAsyncEffect(async () => {
    setLoading(true);
    try {
      const versions = await getVersions();
      setVersion(versions.app);
    } catch (error) {
      setFetchVersionError(true);
    } finally {
      setLoading(false);
    }

    try {
      const status = await invoke<{ installed: boolean; path: string }>("cli:get-status");
      setCliInstalled(status.installed);
      setCliPath(status.path);
    } catch {
      /* CLI not available */
    }

    if (useUpdateStore.getState().status === "idle") {
      void useUpdateStore.getState().check();
    }
  }, []);

  const refreshCliStatus = async () => {
    try {
      const status = await invoke<{ installed: boolean; path: string }>("cli:get-status");
      setCliInstalled(status.installed);
      setCliPath(status.path);
    } catch {
      /* ignore */
    }
  };

  const handleInstallCli = async () => {
    setCliLoading(true);
    try {
      const result = await invoke<{ success: boolean; error?: string }>("cli:install");
      if (result.success) {
        await refreshCliStatus();
        const isWindows = navigator.userAgent.includes("Windows");
        message.success(
          isWindows
            ? "命令行工具安装成功，请打开新的终端窗口使用 tau 命令"
            : "命令行工具安装成功，可以在终端使用 tau 命令"
        );
      } else {
        message.error(`安装失败: ${result.error}`);
      }
    } catch (e: unknown) {
      message.error(`安装失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCliLoading(false);
    }
  };

  const handleUninstallCli = async () => {
    setCliLoading(true);
    try {
      const result = await invoke<{ success: boolean; error?: string }>("cli:uninstall");
      if (result.success) {
        await refreshCliStatus();
        message.success("命令行工具已卸载");
      } else {
        message.error(`卸载失败: ${result.error}`);
      }
    } catch (e: unknown) {
      message.error(`卸载失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCliLoading(false);
    }
  };

  return (
    <SettingContainer>
      <SettingSection title="软件信息" description="查看当前软件版本信息">
        <div className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 dark:border-slate-700 dark:bg-zinc-900/50">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--th-bg-hover)]`}
          >
            <svg
              className="h-6 w-6 text-[var(--th-text-secondary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">当前版本</div>
            {loading ? (
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin text-[var(--th-text-secondary)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span className="text-sm text-gray-400">加载中...</span>
              </div>
            ) : fetchVersionError ? (
              <div className="text-sm text-red-500">获取版本失败</div>
            ) : (
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                v{version}
              </div>
            )}
          </div>
        </div>
      </SettingSection>

      <SettingSection title="软件更新" description="检查并安装 Tau 的最新版本">
        <div className="flex items-center gap-4">
          <div className="flex flex-1 items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                updateStatus === "upToDate"
                  ? "bg-gray-400"
                  : updateStatus === "available" || updateStatus === "ready"
                    ? "bg-status-success"
                    : updateStatus === "error"
                      ? "bg-red-500"
                      : "animate-pulse bg-blue-500"
              }`}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {updateStatus === "idle" && "尚未检查更新"}
              {updateStatus === "checking" && "正在检查更新..."}
              {updateStatus === "upToDate" && "已是最新版本"}
              {updateStatus === "available" && `发现新版本 v${updateNewVersion}`}
              {updateStatus === "downloading" &&
                `正在下载 v${updateNewVersion} ... ${Math.round(updateProgress)}%`}
              {updateStatus === "ready" && `v${updateNewVersion} 已就绪，重启后自动安装`}
              {updateStatus === "error" && (updateError ?? "检查更新失败")}
            </span>
            {updateStatus === "available" && updateFallbackUrl && (
              <a
                className="cursor-pointer text-xs text-[var(--th-text-secondary)] underline-offset-2 hover:underline"
                onClick={() => void openExternal(updateFallbackUrl)}
              >
                手动下载
              </a>
            )}
          </div>
          {updateStatus === "available" ? (
            <SettingButton variant="primary" onClick={() => void downloadUpdate()}>
              下载更新
            </SettingButton>
          ) : updateStatus === "ready" ? (
            <SettingButton variant="primary" onClick={() => void installUpdate()}>
              重启并安装
            </SettingButton>
          ) : updateStatus === "downloading" ? null : (
            <SettingButton loading={updateStatus === "checking"} onClick={() => void checkUpdate()}>
              检查更新
            </SettingButton>
          )}
        </div>
        {updateStatus === "downloading" && (
          <div className="mt-3">
            <Progress percent={Math.round(updateProgress)} size="small" />
          </div>
        )}
        <SettingSwitch
          label="自动检查更新"
          description="应用启动时在后台检查新版本"
          checked={autoCheckUpdate}
          onChange={setAutoCheckUpdate}
        />
      </SettingSection>

      <SettingSection title="数据库管理" description="选择和管理你的笔记数据库">
        <SelectDatabase />
      </SettingSection>

      <SettingSection
        title="命令行工具"
        description="安装 tau 命令到系统 PATH，可在终端中使用 tau 管理卡片和同步数据库"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${cliInstalled ? "bg-status-success" : "bg-gray-400"}`}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {cliInstalled ? "已安装" : "未安装"}
            </span>
            {cliInstalled && cliPath && (
              <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-zinc-800 dark:text-gray-400">
                {cliPath}
              </code>
            )}
          </div>
          {cliInstalled ? (
            <SettingButton variant="danger" loading={cliLoading} onClick={handleUninstallCli}>
              卸载命令行工具
            </SettingButton>
          ) : (
            <SettingButton
              variant="primary"
              loading={cliLoading}
              onClick={handleInstallCli}
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              }
            >
              安装命令行工具
            </SettingButton>
          )}
        </div>
      </SettingSection>
    </SettingContainer>
  );
});

export default AppAbout;
