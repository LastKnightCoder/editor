// 关于：应用身份卡 + 软件更新（仅 Android，应用内下载后交给系统安装器）+ 外部链接。
// iOS 的更新走 App Store / TestFlight，这里不展示更新区。

import { Suspense, lazy, useEffect } from "react";
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
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import appIcon from "../../../../src-tauri/icons/128x128@2x.png";
import { GroupLabel } from "../../../components/GroupLabel";
import { ActionButton } from "../storage/fields";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import {
  notesToShow,
  supportsInAppUpdate,
  useAppUpdate,
  type AppUpdateCheck,
  type UpdatePhase,
} from "./appUpdate";
import { useAppVersion } from "./useAppVersion";

// 更新说明用笔记同款只读编辑器渲染；按需加载，避免设置页静态引入整个编辑器
const PluginMarkdown = lazy(() =>
  import("../../plugins/components/PluginMarkdown").then(module => ({
    default: module.PluginMarkdown,
  }))
);

const LINKS = [
  { label: "官网", detail: "taunote.app", url: "https://taunote.app", icon: Globe },
  {
    label: "使用文档",
    detail: "功能说明与常见问题",
    url: "https://taunote.app/docs/",
    icon: BookOpen,
  },
  {
    label: "源代码",
    detail: "GitHub",
    url: "https://github.com/LastKnightCoder/editor",
    icon: Github,
  },
] as const;

function formatSize(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1} 月 ${date.getDate()} 日发布`;
}

function IdentityCard({ version }: { version: string | undefined }) {
  return (
    <section className="setting-group px-[18px] pb-5 pt-7 text-center">
      <img
        src={appIcon}
        alt=""
        className="shadow-card mx-auto mb-3 h-[76px] w-[76px] rounded-[22px]"
      />
      <h2 className="text-ink-1 text-[21px] font-extrabold tracking-tight">Tau</h2>
      <p className="text-ink-2 mt-0.5 text-[12.5px] tabular-nums">
        {version ? `版本 ${version}` : "读取版本中…"}
      </p>
      <p className="text-ink-3 mt-2 text-[12px] leading-relaxed">让想法，长成体系</p>
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
          <span className="text-ink-1 block text-[14.5px] font-medium">检查更新</span>
          <span className="text-ink-3 block text-[11.5px]">点按重试</span>
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
        <span className="text-ink-1 flex-1 text-[14.5px] font-medium">正在检查更新…</span>
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
          <span className="text-ink-1 block text-[14.5px] font-medium">已是最新版本</span>
          <span className="text-ink-3 block text-[11.5px]">点按重新检查</span>
        </span>
        <RefreshCw size={15} className="text-ink-3" aria-hidden="true" />
      </GroupRow>
    );
  }
  const meta = latest ? [formatSize(latest.size), formatDate(latest.releaseDate)] : [];
  return (
    <GroupRow>
      <StatusTile tone="accent">
        <ArrowDownToLine {...icon} />
      </StatusTile>
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block text-[14.5px] font-medium">
          {phase === "ready" ? "新版本已下载" : `发现新版本 ${latest?.version ?? ""}`}
        </span>
        <span className="text-ink-3 block text-[11.5px] tabular-nums">
          {phase === "downloading" && progress
            ? `正在下载 ${formatSize(progress.received)} / ${formatSize(progress.total)}`
            : meta.filter(Boolean).join(" · ")}
        </span>
        {phase === "downloading" && (
          <ProgressBar received={progress?.received ?? 0} total={progress?.total ?? 1} />
        )}
      </span>
    </GroupRow>
  );
}

function ReleaseNotes({ check }: { check: AppUpdateCheck }) {
  const notes = notesToShow(check);
  if (notes.length === 0) return null;
  return (
    <>
      <GroupLabel>{check.available ? "更新内容" : "本版更新"}</GroupLabel>
      <section className="setting-group space-y-4 px-4 py-3.5">
        {notes.map(item => (
          <div key={item.version}>
            {notes.length > 1 && (
              <p className="text-ink-2 mb-1 text-[12.5px] font-semibold tabular-nums">
                v{item.version}
              </p>
            )}
            <Suspense fallback={<p className="text-ink-3 text-[12.5px]">加载中…</p>}>
              <PluginMarkdown source={item.note} />
            </Suspense>
          </div>
        ))}
      </section>
    </>
  );
}

const UPDATE_ACTIONS: Partial<
  Record<UpdatePhase, { label: string; run?: "download" | "install" }>
> = {
  available: { label: "下载并安装", run: "download" },
  downloading: { label: "正在下载" },
  ready: { label: "安装", run: "install" },
};

function UpdateSection() {
  const { phase, check, error, checkForUpdate, download, install } = useAppUpdate();

  useEffect(() => {
    if (useAppUpdate.getState().phase === "idle") void checkForUpdate();
  }, [checkForUpdate]);

  const action = UPDATE_ACTIONS[phase];
  const run = { download, install };

  return (
    <>
      <GroupLabel>软件更新</GroupLabel>
      <GroupCard>
        <UpdateRow />
      </GroupCard>
      {error && (
        <p className="text-warn flex items-center gap-1.5 px-[15px] pt-2 text-[12px]">
          <CircleAlert size={13} aria-hidden="true" />
          {error}
        </p>
      )}
      {action && (
        <div className="flex pt-3">
          <ActionButton
            label={action.label}
            emphasis
            busy={!action.run}
            disabled={!action.run}
            onClick={() => action.run && void run[action.run]()}
          />
        </div>
      )}
      {(phase === "available" || phase === "ready") && (
        <GroupNote className="pt-2">安装时由系统确认覆盖，笔记与设置都会保留。</GroupNote>
      )}
      {check && <ReleaseNotes check={check} />}
    </>
  );
}

export function AboutSection() {
  const version = useAppVersion();
  return (
    <div className="page-enter space-y-1 pb-8">
      <IdentityCard version={version} />
      {supportsInAppUpdate() && <UpdateSection />}
      <GroupLabel>更多</GroupLabel>
      <GroupCard>
        {LINKS.map(link => (
          <GroupRow key={link.url} onClick={() => void openUrl(link.url).catch(() => undefined)}>
            <StatusTile tone="idle">
              <link.icon size={17} strokeWidth={1.9} aria-hidden="true" />
            </StatusTile>
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 block text-[14.5px] font-medium">{link.label}</span>
              <span className="text-ink-3 block truncate text-[11.5px]">{link.detail}</span>
            </span>
            <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        ))}
      </GroupCard>
      <p className="text-ink-3 pt-5 text-center text-[11px]">由 LastKnightCoder 开发</p>
    </div>
  );
}
