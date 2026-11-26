// 关于：应用身份卡 + 软件更新（仅 Android，应用内下载后交给系统安装器）+ 外部链接。
// iOS 的更新走 App Store / TestFlight，这里不展示更新区。

import { formatUpdateSize, formatPublishedDate } from "./format";
import {
  aboutTranslator,
  useAboutI18n,
  aboutDisplayContext,
  updateErrorText,
  type AboutMessageKey,
} from "./i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowDownToLine,
  BookOpen,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Github,
  Globe,
  LoaderCircle,
  NotebookText,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import appIcon from "../../../../src-tauri/icons/128x128@2x.png";
import { GroupLabel } from "../../../components/GroupLabel";
import { ActionButton } from "../storage/fields";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { useNavigator } from "../../../router";
import {
  notesToShow,
  supportsInAppUpdate,
  useAppUpdate,
  useAutoUpdateCheck,
  type AppUpdateCheck,
  type UpdatePhase,
} from "./appUpdate";
import { useAppVersion } from "./useAppVersion";

const LINKS = [
  { label: "links.site", detail: "taunote.app", url: "https://taunote.app", icon: Globe },
  {
    label: "links.docs",
    detailMessage: "links.docsHint",
    url: "https://taunote.app/docs/",
    icon: BookOpen,
  },
  {
    label: "links.source",
    detail: "GitHub",
    url: "https://github.com/LastKnightCoder/editor",
    icon: Github,
  },
] as const;

function IdentityCard({ version }: { version: string | undefined }) {
  useAboutI18n();
  return (
    <section className="setting-group px-[18px] pt-7 pb-5 text-center">
      <img
        src={appIcon}
        alt=""
        className="shadow-card mx-auto mb-3 h-[76px] w-[76px] rounded-[22px]"
      />
      <h2 className="text-ink-1 text-[21px] font-extrabold tracking-tight">Tau</h2>
      <p className="text-ink-2 mt-0.5 text-[12.5px] tabular-nums">
        {version
          ? aboutTranslator.t("version.label", { version })
          : aboutTranslator.t("version.loading")}
      </p>
      <p className="text-ink-3 mt-2 text-[12px] leading-relaxed">{aboutTranslator.t("tagline")}</p>
    </section>
  );
}

function StatusTile({
  tone,
  children,
}: {
  tone: "ok" | "accent" | "warn" | "idle";
  children: ReactNode;
}) {
  useAboutI18n();
  const toneClass = {
    ok: "bg-ok-soft text-ok",
    accent: "bg-accent-soft text-accent-text",
    warn: "bg-warn-soft text-warn",
    idle: "bg-page text-ink-2",
  }[tone];
  return (
    <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl ${toneClass}`}>
      {children}
    </span>
  );
}

function ProgressBar({ received, total }: { received: number; total: number }) {
  useAboutI18n();
  const percent = total > 0 ? Math.min(100, (received / total) * 100) : 0;
  return (
    <span className="bg-line-1 mt-2 block h-1 overflow-hidden rounded-full" aria-hidden="true">
      <span
        className="bg-accent block h-full rounded-full transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

function UpdateRow() {
  useAboutI18n();
  const { phase, check, progress, error, checkForUpdate } = useAppUpdate();
  const icon = { size: 17, strokeWidth: 1.9, "aria-hidden": true } as const;
  const latest = check?.latest;

  if (phase === "idle" && error) {
    return (
      <GroupRow onClick={() => void checkForUpdate()}>
        <StatusTile tone="warn">
          <CircleAlert {...icon} />
        </StatusTile>
        <span className="min-w-0 flex-1">
          <span className="text-ink-1 block text-[14.5px] font-medium">
            {aboutTranslator.t("action.check")}
          </span>
          <span className="text-ink-3 block text-[11.5px]">
            {aboutTranslator.t("action.retry")}
          </span>
        </span>
        <RefreshCw size={15} className="text-ink-3" aria-hidden="true" />
      </GroupRow>
    );
  }
  if (phase === "checking" || phase === "idle") {
    return (
      <GroupRow>
        <StatusTile tone="idle">
          <LoaderCircle {...icon} className="animate-spin" />
        </StatusTile>
        <span className="text-ink-1 flex-1 text-[14.5px] font-medium">
          {aboutTranslator.t("status.mobileChecking")}
        </span>
      </GroupRow>
    );
  }
  if (phase === "latest") {
    return (
      <GroupRow onClick={() => void checkForUpdate()}>
        <StatusTile tone="ok">
          <CircleCheck {...icon} />
        </StatusTile>
        <span className="min-w-0 flex-1">
          <span className="text-ink-1 block text-[14.5px] font-medium">
            {aboutTranslator.t("status.mobileLatest")}
          </span>
          <span className="text-ink-3 block text-[11.5px]">
            {aboutTranslator.t("action.recheck")}
          </span>
        </span>
        <RefreshCw size={15} className="text-ink-3" aria-hidden="true" />
      </GroupRow>
    );
  }
  const meta = latest
    ? [
        formatUpdateSize(latest.size, aboutDisplayContext().locale),
        formatPublishedDate(latest.releaseDate, aboutDisplayContext()),
      ]
    : [];
  return (
    <GroupRow>
      <StatusTile tone="accent">
        <ArrowDownToLine {...icon} />
      </StatusTile>
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block text-[14.5px] font-medium">
          {phase === "ready"
            ? aboutTranslator.t("status.mobileReady")
            : aboutTranslator.t("status.mobileAvailable", { version: latest?.version ?? "" })}
        </span>
        <span className="text-ink-3 block text-[11.5px] tabular-nums">
          {phase === "downloading" && progress
            ? aboutTranslator.t("status.mobileDownloading", {
                received: formatUpdateSize(progress.received, aboutDisplayContext().locale),
                total: formatUpdateSize(progress.total, aboutDisplayContext().locale),
              })
            : meta.filter(Boolean).join(" · ")}
        </span>
        {phase === "downloading" && (
          <ProgressBar received={progress?.received ?? 0} total={progress?.total ?? 1} />
        )}
      </span>
    </GroupRow>
  );
}

/** 更新说明不在关于页展开，点进独立页面查看 */
function ReleaseNotesRow({ check }: { check: AppUpdateCheck }) {
  useAboutI18n();
  const navigator = useNavigator();
  const notes = notesToShow(check);
  if (notes.length === 0) return null;
  return (
    <GroupRow onClick={() => navigator.push("releaseNotes")}>
      <StatusTile tone="idle">
        <NotebookText size={17} strokeWidth={1.9} aria-hidden="true" />
      </StatusTile>
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block text-[14.5px] font-medium">
          {check.available ? aboutTranslator.t("notes.new") : aboutTranslator.t("notes.current")}
        </span>
        <span className="text-ink-3 block text-[11.5px] tabular-nums">
          {check.available && notes.length > 1
            ? aboutTranslator.t("notes.versions", {
                count: notes.length,
                amount: notes.length.toLocaleString(aboutDisplayContext().locale),
              })
            : `v${notes[0].version}`}
        </span>
      </span>
      <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
    </GroupRow>
  );
}

const UPDATE_ACTIONS: Partial<
  Record<UpdatePhase, { label: AboutMessageKey; run?: "download" | "install" }>
> = {
  available: { label: "action.downloadInstall", run: "download" },
  downloading: { label: "action.downloading" },
  ready: { label: "action.install", run: "install" },
};

function UpdateSection() {
  useAboutI18n();
  const { phase, check, error, download, install } = useAppUpdate();
  useAutoUpdateCheck();

  const action = UPDATE_ACTIONS[phase];
  const run = { download, install };

  return (
    <>
      <GroupLabel>{aboutTranslator.t("update.mobileTitle")}</GroupLabel>
      <GroupCard>
        <UpdateRow />
        {check && <ReleaseNotesRow check={check} />}
      </GroupCard>
      {error && (
        <p className="text-warn flex items-center gap-1.5 px-[15px] pt-2 text-[12px]">
          <CircleAlert size={13} aria-hidden="true" />
          {updateErrorText(error)}
        </p>
      )}
      {action && (
        <div className="flex pt-3">
          <ActionButton
            label={aboutTranslator.t(action.label)}
            emphasis
            busy={!action.run}
            disabled={!action.run}
            onClick={() => action.run && void run[action.run]()}
          />
        </div>
      )}
      {(phase === "available" || phase === "ready") && (
        <GroupNote className="pt-2">{aboutTranslator.t("update.installHint")}</GroupNote>
      )}
    </>
  );
}

export function AboutSection() {
  useAboutI18n();
  const version = useAppVersion();
  return (
    <div className="page-enter space-y-1 pb-8">
      <IdentityCard version={version} />
      {supportsInAppUpdate() && <UpdateSection />}
      <GroupLabel>{aboutTranslator.t("more")}</GroupLabel>
      <GroupCard>
        {LINKS.map(link => (
          <GroupRow key={link.url} onClick={() => void openUrl(link.url).catch(() => undefined)}>
            <StatusTile tone="idle">
              <link.icon size={17} strokeWidth={1.9} aria-hidden="true" />
            </StatusTile>
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 block text-[14.5px] font-medium">
                {aboutTranslator.t(link.label)}
              </span>
              <span className="text-ink-3 block truncate text-[11.5px]">
                {"detailMessage" in link ? aboutTranslator.t(link.detailMessage) : link.detail}
              </span>
            </span>
            <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        ))}
      </GroupCard>
      <p className="text-ink-3 pt-5 text-center text-[11px]">
        {aboutTranslator.t("developer", { name: "LastKnightCoder" })}
      </p>
    </div>
  );
}
