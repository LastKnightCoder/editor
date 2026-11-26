/**
 * 关于与更新 —— 初版。
 *
 * 移植 legacy AppAbout（数据库管理已迁到「同步 · 本地数据库」Tab）：
 * - 顶部应用卡：图标 / 名称 / 版本 + 更新状态签与对应动作（检查 / 重启并安装），
 *   检测到新版本即在后台自动下载，下载中显示进度条，就绪后一键重启安装；
 *   出错或需要手动获取时提供「手动下载」外链；
 *   状态全部来自 useUpdateStore（主进程事件由全局 AutoUpdateChecker 挂载，本页只读状态与触发动作）
 * - 有可用更新时在「更新」组提供新版本内容入口，经弹窗展示跨越版本的公告（来自 latest*.yml）
 * - 更新：自动检查更新开关（misc.update.autoCheck）；本版更新内容（安装包内置公告）
 */

import { aboutTranslator, useAboutI18n } from "../about/i18n";
import { useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw, RotateCw } from "lucide-react";
import { SettingRow, Button, Panel, Switch } from "@tau/ui";
import logo from "@/assets/logo.png";
import useSettingStore from "@/stores/useSettingStore";
import { useUpdateStore, type UpdateStatus } from "@/stores/useUpdateStore";
import { getVersions, openExternal } from "@/commands";
import { bundledNotesBetween } from "@/features/release-notes/notes";
import { useReleaseNotesStore } from "@/features/release-notes/releaseNotesStore";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";
import { BackgroundGroup } from "./BackgroundGroup";

export function AboutSection() {
  useAboutI18n();
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
              className="size-[52px] shrink-0 mix-blend-multiply select-none dark:mix-blend-normal dark:brightness-[0.85]"
            />
            <div className="min-w-0">
              <div className="text-tau-body-lg text-ink-1 font-semibold">Tau</div>
              <div className="font-tau-mono text-tau-meta text-ink-2">
                {versionError
                  ? aboutTranslator.t("version.failed")
                  : version
                    ? `v${version}`
                    : aboutTranslator.t("loading")}
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
                  {aboutTranslator.t("action.manualDownload")}
                </Button>
              )}
              {status === "available" ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={Download}
                  onClick={() => void useUpdateStore.getState().download()}
                >
                  {aboutTranslator.t("action.update")}
                </Button>
              ) : status === "ready" ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={RotateCw}
                  onClick={() => void useUpdateStore.getState().install()}
                >
                  {aboutTranslator.t("action.restart")}
                </Button>
              ) : status === "downloading" ? null : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  loading={status === "checking"}
                  loadingText={aboutTranslator.t("action.checking")}
                  onClick={() => void useUpdateStore.getState().check()}
                >
                  {aboutTranslator.t("action.check")}
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
            <div className="text-tau-meta text-ink-2 mt-2.5">
              {errorMessage ?? aboutTranslator.t("error.check")}
            </div>
          )}
        </Panel>
      </SettingsGroup>

      <BackgroundGroup />
      <SettingsGroup title={aboutTranslator.t("update.title")}>
        <SettingRow
          title={aboutTranslator.t("update.auto")}
          description={aboutTranslator.t("update.autoHint")}
        >
          <Switch
            aria-label={aboutTranslator.t("update.auto")}
            checked={autoCheck}
            onCheckedChange={setAutoCheck}
          />
        </SettingRow>
        {releaseNotes.length > 0 && (
          <SettingRow
            title={aboutTranslator.t("notes.new")}
            description={aboutTranslator.t("notes.changes", { version: releaseNotes[0].version })}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => useReleaseNotesStore.getState().show(releaseNotes)}
            >
              {aboutTranslator.t("action.view")}
            </Button>
          </SettingRow>
        )}
        {currentNotes.length > 0 && (
          <SettingRow
            title={aboutTranslator.t("notes.current")}
            description={aboutTranslator.t("notes.changes", { version: version ?? "" })}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => useReleaseNotesStore.getState().show(currentNotes)}
            >
              {aboutTranslator.t("action.view")}
            </Button>
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={aboutTranslator.t("more")}>
        {APP_LINKS.map(link => (
          <SettingRow
            key={link.url}
            title={aboutTranslator.t(link.label)}
            description={
              "detailMessage" in link ? aboutTranslator.t(link.detailMessage) : link.detail
            }
          >
            <Button
              variant="ghost"
              size="sm"
              icon={ExternalLink}
              onClick={() => openExternal(link.url)}
            >
              {aboutTranslator.t("action.open")}
            </Button>
          </SettingRow>
        ))}
      </SettingsGroup>
    </>
  );
}

/** 关于页底部外链，与移动端 AboutSection 的 LINKS 保持一致 */
const APP_LINKS = [
  { label: "links.site", detail: "taunote.app", url: "https://taunote.app" },
  { label: "links.docs", detailMessage: "links.docsHint", url: "https://taunote.app/docs/" },
  { label: "links.source", detail: "GitHub", url: "https://github.com/LastKnightCoder/editor" },
] as const;

function UpdateChip({
  status,
  newVersion,
  percent,
}: {
  status: UpdateStatus;
  newVersion: string | null;
  percent: number;
}) {
  useAboutI18n();
  switch (status) {
    case "checking":
      return <StatusChip tone="accent">{aboutTranslator.t("status.checking")}</StatusChip>;
    case "upToDate":
      return <StatusChip tone="ok">{aboutTranslator.t("status.latest")}</StatusChip>;
    case "available":
      return (
        <StatusChip tone="accent">
          {aboutTranslator.t("status.available", { version: newVersion ?? "" })}
        </StatusChip>
      );
    case "downloading":
      return (
        <StatusChip tone="accent">
          {aboutTranslator.t("status.downloading", { percent })}
        </StatusChip>
      );
    case "ready":
      return (
        <StatusChip tone="ok">
          {aboutTranslator.t("status.ready", { version: newVersion ?? "" })}
        </StatusChip>
      );
    case "error":
      return <StatusChip tone="danger">{aboutTranslator.t("status.failed")}</StatusChip>;
    default:
      return <StatusChip>{aboutTranslator.t("status.unchecked")}</StatusChip>;
  }
}
