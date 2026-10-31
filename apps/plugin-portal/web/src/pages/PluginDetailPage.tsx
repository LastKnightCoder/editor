import { useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { evaluateCenterCompatibility } from "@tau/plugins/center";
import { comparePluginVersions } from "@tau/plugins/package";
import { ArrowLeft, ArrowUpRight, CloudOff, Copy, Download, Github, SearchX } from "lucide-react";
import { Button, IconButton, Loading, Tabs, Tooltip, toast } from "@tau/ui";
import type { CenterRelease } from "../../../contracts";
import { Avatar } from "../app/TopBar";
import { hasCode } from "../api/errors";
import { PluginMark } from "../components/PluginMark";
import { formatCount, formatRelative, formatTime } from "../components/format";
import { Markdown } from "../components/markdown/Markdown";
import { ErrorState } from "../components/states";
import { StatsHint } from "../features/catalog/StatsHint";
import { useCenterRelease, useCenterVersions } from "../features/catalog/center-queries";
import { PlatformBadges } from "../features/catalog/PlatformBadges";
import { PORTABLE_PLATFORMS, type PortablePlatform } from "../features/catalog/platforms";
import { usePluginStats } from "../features/catalog/queries";
import { ReleaseAvailability } from "../features/catalog/ReleaseAvailability";
import { TargetMatrix } from "../features/catalog/TargetMatrix";
import { useZipSave } from "../features/catalog/useZipSave";
import { LikeButton } from "../features/community/LikeButton";
import { PluginComments } from "../features/community/PluginComments";
import { formatBytes } from "../features/submission/validation";

type DetailTab = "readme" | "changelog" | "platforms" | "versions" | "comments";

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3 inline-flex shrink-0 items-center gap-1">{label}</dt>
      <dd className="text-ink-1 min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

/** 已加载版本按 SemVer 降序去重；发布时间不代表版本高低。 */
function sortVersions(pages: { items: CenterRelease[] }[] | undefined): CenterRelease[] {
  const unique = new Map(pages?.flatMap(page => page.items).map(item => [item.releaseId, item]));
  return [...unique.values()].sort((a, b) => comparePluginVersions(b.version, a.version));
}

function VersionList({
  pluginId,
  versions,
  highlight,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  pluginId: string;
  versions: CenterRelease[];
  highlight?: PortablePlatform;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const download = useZipSave();
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-line-1 flex flex-col divide-y">
        {versions.map((release, index) => (
          <li key={release.releaseId} className="text-tau-meta flex flex-col gap-2 px-1 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-tau-mono text-ink-1 w-16 font-semibold">
                v{release.version}
              </span>
              {index === 0 && (
                <span className="bg-accent-soft text-accent-text text-tau-micro rounded-full px-2 py-px">
                  最新
                </span>
              )}
              <PlatformBadges version={release} />
              <span className="text-ink-3 ml-auto w-16 text-right">
                {formatBytes(release.size)}
              </span>
              <span className="text-ink-3 w-24 text-right">
                {formatRelative(release.publishedAt)}
              </span>
              <Tooltip content={`下载 v${release.version}`}>
                <IconButton
                  aria-label={`下载 v${release.version}`}
                  disabled={download.pending}
                  onClick={() => download.save(pluginId, release)}
                >
                  <Download size={14} />
                </IconButton>
              </Tooltip>
            </div>
            <details>
              <summary className="text-tau-sm text-ink-2 hover:text-ink-1 w-fit cursor-pointer select-none">
                平台声明
              </summary>
              <div className="mt-2">
                <TargetMatrix targets={release.targets} highlight={highlight} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="flex justify-center">
          <Button loading={loadingMore} onClick={onLoadMore}>
            加载更多版本
          </Button>
        </div>
      )}
    </div>
  );
}

export function PluginDetailPage() {
  const { pluginId = "" } = useParams();
  const [params] = useSearchParams();
  const highlight = PORTABLE_PLATFORMS.find(platform => platform === params.get("platform"));
  const releases = useCenterVersions(pluginId, "all");
  const versions = sortVersions(releases.data?.pages);
  const latestSummary = versions[0] ?? null;
  const release = useCenterRelease(latestSummary?.releaseId ?? null);
  const stats = usePluginStats(pluginId);
  const download = useZipSave();
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
      key: "platforms" as const,
      label: "平台支持",
      children: <TargetMatrix targets={release.data.targets} highlight={highlight} />,
    },
    {
      key: "versions" as const,
      label: (
        <>
          版本<span className="text-tau-micro text-ink-3 font-normal">{versions.length}</span>
        </>
      ),
      children: (
        <VersionList
          pluginId={pluginId}
          versions={versions}
          highlight={highlight}
          hasMore={releases.hasNextPage}
          loadingMore={releases.isFetchingNextPage}
          onLoadMore={() => void releases.fetchNextPage()}
        />
      ),
    },
    { key: "comments" as const, label: "评论", children: <PluginComments pluginId={pluginId} /> },
  ];

  return (
    <main className="mx-auto max-w-[1080px] px-4 pt-5 pb-20 sm:px-8 sm:pt-7">
      {back}
      <header className="flex items-start gap-4 sm:gap-5">
        <PluginMark
          pluginId={pluginId}
          name={manifest.name}
          size="lg"
          className="sm:size-[72px] sm:rounded-[18px] sm:text-[30px]"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-tau-title-lg text-ink-1 sm:text-tau-hero leading-tight font-semibold tracking-[-0.01em]">
            {manifest.name}
          </h1>
          <p className="text-tau-meta text-ink-3 mt-1 flex flex-wrap items-center gap-1.5">
            <Avatar user={publisher} size={18} />@{publisher.login}
            <span>·</span>v{manifest.version}
            <span>·</span>
            {formatRelative(release.data.publishedAt)}更新
          </p>
          <PlatformBadges version={release.data} className="mt-1.5" />
          <p className="text-tau-body text-ink-2 sm:text-tau-body-lg mt-2 max-w-[60ch]">
            {manifest.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={Download}
              loading={download.pending}
              onClick={() => download.save(pluginId, release.data)}
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

      <div className="mt-6 grid gap-6 sm:mt-7 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Tabs
          items={items}
          activeKey={tab}
          onChange={setTab}
          className="min-w-0 [&_[role=tab]]:shrink-0 [&_[role=tablist]]:overflow-x-auto"
        />
        <aside className="flex flex-col gap-3.5">
          <dl className="border-line-1 bg-surface rounded-tau-md shadow-card text-tau-meta flex flex-col gap-2.5 border p-4">
            <Fact label="版本">
              <span className="font-tau-mono">v{manifest.version}</span>
            </Fact>
            <Fact label="包格式">
              {release.data.packageKind === "skills"
                ? "独立 Skill 包"
                : release.data.formatVersion === 3
                  ? `跨端 · ${release.data.profile}`
                  : "旧格式（仅桌面）"}
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
            <ReleaseAvailability
              latest={release.data}
              compatible={null}
              compatibility={evaluateCenterCompatibility(release.data)}
            />
            {release.data.formatVersion !== 3 &&
              !(release.data.packageKind === "skills" && manifest.platform === "portable") && (
                <p className="text-tau-sm text-ink-3 leading-[1.7]">
                  也可以下载 ZIP，在桌面端插件页选择本地安装；本地安装的插件默认停用。
                </p>
              )}
          </div>
        </aside>
      </div>
    </main>
  );
}
