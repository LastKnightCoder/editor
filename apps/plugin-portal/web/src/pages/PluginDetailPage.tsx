import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, CloudOff, Copy, Download, Github, SearchX } from "lucide-react";
import { Button, IconButton, Loading, Tabs, Tooltip, toast } from "@tau/ui";
import type { ReleaseSummary } from "../../../contracts";
import { useApi } from "../app/api";
import { Avatar } from "../app/TopBar";
import { savePluginZip } from "../api/download";
import { errorMessage, hasCode } from "../api/errors";
import { PluginMark } from "../components/PluginMark";
import { formatCount, formatRelative, formatTime } from "../components/format";
import { Markdown } from "../components/markdown/Markdown";
import { ErrorState } from "../components/states";
import { StatsHint } from "../features/catalog/StatsHint";
import {
  highestRelease,
  sortByVersionDesc,
  usePluginReleases,
  usePluginStats,
  useRelease,
} from "../features/catalog/queries";
import { LikeButton } from "../features/community/LikeButton";
import { PluginComments } from "../features/community/PluginComments";
import { formatBytes } from "../features/submission/validation";

type DetailTab = "readme" | "changelog" | "versions" | "comments";

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3 inline-flex shrink-0 items-center gap-1">{label}</dt>
      <dd className="text-ink-1 min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function useZipDownload() {
  const api = useApi();
  return useMutation({
    mutationFn: (release: Pick<ReleaseSummary, "id" | "pluginId" | "version">) =>
      savePluginZip(api, release.id, `${release.pluginId}-${release.version}.zip`),
    onError: error => toast.error(`下载失败：${errorMessage(error)}`),
  });
}

function VersionList({ versions }: { versions: ReleaseSummary[] }) {
  const download = useZipDownload();
  return (
    <ul className="divide-line-1 flex flex-col divide-y">
      {versions.map((release, index) => (
        <li key={release.id} className="text-tau-meta flex items-center gap-4 px-1 py-3">
          <span className="font-tau-mono text-ink-1 w-16 font-semibold">v{release.version}</span>
          {index === 0 && (
            <span className="bg-accent-soft text-accent-text text-tau-micro rounded-full px-2 py-px">
              最新
            </span>
          )}
          <span className="text-ink-3 ml-auto">最低 Tau {release.manifest.minAppVersion}</span>
          <span className="text-ink-3 w-16 text-right">{formatBytes(release.size)}</span>
          <span className="text-ink-3 w-24 text-right">{formatRelative(release.publishedAt)}</span>
          <Tooltip content={`下载 v${release.version}`}>
            <IconButton
              aria-label={`下载 v${release.version}`}
              disabled={download.isPending}
              onClick={() => download.mutate(release)}
            >
              <Download size={14} />
            </IconButton>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

export function PluginDetailPage() {
  const { pluginId = "" } = useParams();
  const releases = usePluginReleases(pluginId);
  const latestSummary = highestRelease(releases.data?.items);
  const release = useRelease(latestSummary?.id);
  const stats = usePluginStats(pluginId);
  const download = useZipDownload();
  const [tab, setTab] = useState<DetailTab>("readme");

  const back = (
    <Link
      to="/plugins"
      className="text-tau-meta text-ink-3 hover:text-ink-1 mb-4 inline-flex items-center gap-1 transition-colors"
    >
      <ArrowLeft size={14} />
      插件中心
    </Link>
  );
  if (releases.isPending || (latestSummary && release.isPending))
    return <Loading minHeight={420} label="正在读取插件…" />;
  const failure = releases.error ?? release.error;
  if (failure || !latestSummary || !release.data) {
    const missing = !failure || hasCode(failure, "NOT_FOUND");
    return (
      <main className="mx-auto max-w-[720px] px-8 py-10">
        {back}
        <ErrorState
          icon={missing ? SearchX : CloudOff}
          title={missing ? "找不到这个插件" : "插件资料暂时打不开"}
          error={missing ? new Error("它可能还没有发布，或者插件 ID 有误。") : failure}
          onRetry={missing ? undefined : () => void releases.refetch()}
        />
      </main>
    );
  }

  const { content, repository, publisher } = release.data;
  const manifest = content.manifest;
  const versions = sortByVersionDesc(releases.data?.items);
  const copySha = () =>
    void navigator.clipboard
      ?.writeText(release.data.sha256)
      .then(() => toast.success("已复制 SHA-256"));

  const items = [
    { key: "readme" as const, label: "介绍", children: <Markdown source={content.readme} /> },
    ...(content.changelog
      ? [
          {
            key: "changelog" as const,
            label: "更新说明",
            children: <Markdown source={content.changelog} />,
          },
        ]
      : []),
    {
      key: "versions" as const,
      label: (
        <>
          版本<span className="text-tau-micro text-ink-3 font-normal">{versions.length}</span>
        </>
      ),
      children: <VersionList versions={versions} />,
    },
    { key: "comments" as const, label: "评论", children: <PluginComments pluginId={pluginId} /> },
  ];

  return (
    <main className="mx-auto max-w-[1080px] px-8 pb-20 pt-7">
      {back}
      <header className="flex items-start gap-5">
        <PluginMark pluginId={pluginId} name={manifest.name} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-tau-hero text-ink-1 font-semibold leading-tight tracking-[-0.01em]">
            {manifest.name}
          </h1>
          <p className="text-tau-meta text-ink-3 mt-1 flex flex-wrap items-center gap-1.5">
            <Avatar user={publisher} size={18} />@{publisher.login}
            <span>·</span>v{manifest.version}
            <span>·</span>
            {formatRelative(release.data.publishedAt)}更新
          </p>
          <p className="text-tau-body-lg text-ink-2 mt-2 max-w-[60ch]">{manifest.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={Download}
              loading={download.isPending}
              onClick={() => download.mutate(release.data)}
            >
              下载 v{manifest.version}
            </Button>
            <LikeButton pluginId={pluginId} />
            {repository && (
              <Button
                variant="ghost"
                icon={Github}
                onClick={() => window.open(repository, "_blank", "noopener")}
              >
                源码
                <ArrowUpRight size={14} className="text-ink-3" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Tabs items={items} activeKey={tab} onChange={setTab} />
        <aside className="flex flex-col gap-3.5">
          <dl className="border-line-1 bg-surface rounded-tau-md shadow-card text-tau-meta flex flex-col gap-2.5 border p-4">
            <Fact label="版本">
              <span className="font-tau-mono">v{manifest.version}</span>
            </Fact>
            <Fact label="最低 Tau">
              <span className="font-tau-mono">{manifest.minAppVersion}</span>
            </Fact>
            <Fact label="大小">{formatBytes(release.data.size)}</Fact>
            <Fact label="发布于">{formatTime(release.data.publishedAt)}</Fact>
            <div className="border-line-1 border-t" />
            <Fact
              label={
                <>
                  累计下载
                  <StatsHint />
                </>
              }
            >
              {stats.data ? formatCount(stats.data.downloadsTotal) : "—"}
            </Fact>
            <Fact label="近 7 日">{stats.data ? formatCount(stats.data.downloads7d) : "—"}</Fact>
            <div className="border-line-1 border-t" />
            <Fact label="插件 ID">
              <span className="font-tau-mono">{pluginId}</span>
            </Fact>
            <Fact label="SHA-256">
              <span className="font-tau-mono inline-flex items-center gap-1">
                {release.data.sha256.slice(0, 4)}…{release.data.sha256.slice(-4)}
                <IconButton aria-label="复制 SHA-256" onClick={copySha} className="size-6">
                  <Copy size={12} />
                </IconButton>
              </span>
            </Fact>
          </dl>
          <div className="border-line-1 bg-surface rounded-tau-md shadow-card flex flex-col gap-1.5 border p-4">
            <p className="text-tau-body text-ink-1 font-semibold">怎么安装</p>
            <p className="text-tau-meta text-ink-2 leading-[1.7]">
              在 Tau 桌面端打开「插件」页，搜索「{manifest.name}」一键安装，装好后自动启用。
            </p>
            <p className="text-tau-sm text-ink-3 leading-[1.7]">
              也可以下载 ZIP，在插件页选择本地安装；本地安装的插件默认停用。
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
