import { useState } from "react";
import { comparePluginVersions } from "@tau/plugins/package";
import { Button, Loading } from "@tau/ui";
import { usePage } from "../../router";
import { PluginPageShell } from "./PluginPageView";
import { CenterInstallSheet } from "./CenterInstallSheet";
import { AvailabilityNote } from "./components/AvailabilityNote";
import { PLATFORM_LABELS, categoryLabel } from "./components/centerDisplay";
import { ReleaseHistoryList } from "./components/ReleaseHistoryList";
import { INSTALL_CLOSED_REASON, storePrimaryAction } from "./components/storeActions";
import { TargetSummary } from "./components/TargetSummary";
import {
  useMobileCenterConfig,
  useMobileCenterInstall,
  useMobileCenterRelease,
  useMobileCenterResolution,
  useMobileCenterVersions,
} from "./data/center-queries";
import { usePluginManager } from "./data/usePluginManager";

/** 商店详情：资料取本平台最高声明版本，安装取选版结果；历史展示全部平台版本。 */
export function PluginStoreDetail() {
  const { params } = usePage<{ pluginId: string }>();
  const pluginId = params.pluginId;
  const config = useMobileCenterConfig();
  const host = config.data?.host ?? null;
  const versions = useMobileCenterVersions(pluginId, "all");
  const { query: resolution } = useMobileCenterResolution(pluginId);
  const manager = usePluginManager();
  const install = useMobileCenterInstall();
  const [installing, setInstalling] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const history = [
    ...new Map(
      versions.data?.pages.flatMap(page => page.items).map(item => [item.releaseId, item])
    ).values(),
  ].sort((a, b) => comparePluginVersions(b.version, a.version));
  const latest = (host && history.find(item => item.targets[host.platform])) ?? history[0] ?? null;
  const release = useMobileCenterRelease(latest?.releaseId ?? null);
  const installedVersion = manager.items.find(item => item.id === pluginId)?.version ?? null;
  const compatible = resolution.data?.release ?? null;
  const installationEnabled = !!config.data?.installationEnabled;

  const failure = config.error ?? versions.error ?? release.error;
  if (config.isPending || versions.isPending || (latest && release.isPending))
    return (
      <PluginPageShell title="插件详情">
        <Loading minHeight={240} label="正在读取插件…" />
      </PluginPageShell>
    );
  if (failure || !latest || !release.data)
    return (
      <PluginPageShell title="插件详情">
        <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-ink text-[15px] font-semibold">
            {failure ? "插件资料暂时打不开" : "找不到这个插件"}
          </p>
          <p className="text-ink-2 break-words text-[13px]">
            {failure ? String(failure) : "它可能已下架，或者还没有发布。"}
          </p>
          {failure && (
            <Button
              className="min-h-11"
              onClick={() => void (config.isError ? config.refetch() : versions.refetch())}
            >
              重试
            </Button>
          )}
        </div>
      </PluginPageShell>
    );

  const manifest = release.data.content.manifest;
  const primary = storePrimaryAction({
    compatibleVersion: compatible?.version ?? null,
    installedVersion,
    installationEnabled,
  });
  return (
    <PluginPageShell title={manifest.name}>
      <div className="flex flex-col gap-4 pb-6">
        <section className="bg-surface shadow-card rounded-card flex flex-col gap-2 p-4">
          <p className="text-ink-3 text-[12px]">
            @{release.data.publisher.login} · 最新 v{latest.version}
            {installedVersion && ` · 已安装 v${installedVersion}`}
          </p>
          <p className="text-ink-2 text-[14px] leading-relaxed">{manifest.description}</p>
          {manifest.categories?.length ? (
            <p className="text-ink-3 text-[12px]">
              {manifest.categories.map(categoryLabel).join("、")}
            </p>
          ) : null}
          {resolution.isPending && host ? (
            <p className="text-ink-3 text-[12px]">正在检查此设备能否安装…</p>
          ) : resolution.data ? (
            <AvailabilityNote
              latestVersion={latest.version}
              compatibleVersion={compatible?.version ?? null}
              compatibility={resolution.data.compatibility}
            />
          ) : resolution.isError ? (
            <p role="alert" className="text-danger text-[12px]">
              兼容检查失败：{String(resolution.error)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {primary.kind === "installed" ? (
              <span className="text-ink-3 text-[13px]">已安装 v{primary.version}</span>
            ) : primary.kind === "unavailable" ? (
              <span className="text-ink-3 text-[13px]">暂不可安装</span>
            ) : (
              <Button
                variant={primary.kind === "install" ? "primary" : "secondary"}
                className="min-h-11"
                disabled={!primary.allowed}
                loading={install.mutation.isPending}
                onClick={() => setInstalling(true)}
              >
                {primary.kind === "install" ? "安装" : "更新到"} v{primary.version}
              </Button>
            )}
          </div>
          {"reason" in primary && primary.reason && (
            <p className="text-ink-3 text-[12px]">{primary.reason}</p>
          )}
          {!host && config.data && (
            <p className="text-ink-3 text-[12px]">当前平台不能安装移动插件。</p>
          )}
          {host && !installationEnabled && primary.kind === "unavailable" && (
            <p className="text-ink-3 text-[12px]">{INSTALL_CLOSED_REASON}。</p>
          )}
        </section>

        <section className="bg-surface shadow-card rounded-card flex flex-col gap-2 p-4">
          <h2 className="text-ink text-[15px] font-semibold">
            {host ? `${PLATFORM_LABELS[host.platform]}支持` : "平台支持"}
          </h2>
          <TargetSummary targets={latest.targets} platform={host?.platform ?? null} />
        </section>

        <section className="bg-surface shadow-card rounded-card flex flex-col gap-2 p-4">
          <h2 className="text-ink text-[15px] font-semibold">介绍</h2>
          {/* 包内 README 按纯文本显示，不解析 HTML 或加载远程资源 */}
          <p
            className={`text-ink-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed ${expanded ? "" : "line-clamp-6"}`}
          >
            {release.data.content.readme}
          </p>
          <Button
            variant="ghost"
            className="min-h-11 self-start"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "收起" : "展开全文"}
          </Button>
        </section>

        <section className="bg-surface shadow-card rounded-card flex flex-col gap-2 p-4">
          <h2 className="text-ink text-[15px] font-semibold">版本历史</h2>
          <ReleaseHistoryList
            platformLabel={host ? PLATFORM_LABELS[host.platform] : "本平台"}
            items={history.map((item, index) => ({
              releaseId: item.releaseId,
              version: item.version,
              publishedAt: item.publishedAt,
              minAppVersion: host ? (item.targets[host.platform]?.minAppVersion ?? null) : null,
              latest: index === 0,
              compatible: item.releaseId === compatible?.releaseId,
              installed: item.version === installedVersion,
            }))}
          />
          {versions.hasNextPage && (
            <Button
              className="min-h-11 self-center"
              loading={versions.isFetchingNextPage}
              onClick={() => void versions.fetchNextPage()}
            >
              加载更多版本
            </Button>
          )}
        </section>
      </div>
      {installing && (
        <CenterInstallSheet
          pluginId={pluginId}
          name={manifest.name}
          installedVersion={installedVersion}
          installedPermissions={manager.items.find(item => item.id === pluginId)?.permissions}
          install={install}
          onClose={() => setInstalling(false)}
        />
      )}
    </PluginPageShell>
  );
}
