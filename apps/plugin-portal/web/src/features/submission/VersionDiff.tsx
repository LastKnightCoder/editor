import { GitCompare } from "lucide-react";
import { Button, Loading, Panel, cn } from "@tau/ui";
import type { PackageManifest, Submission } from "../../../../contracts";
import { useCenterVersions } from "../catalog/center-queries";
import { usePluginReleases } from "../catalog/queries";
import { TargetsDiff } from "./TargetsDiff";
import { formatBytes } from "./validation";
import { diffFiles, diffManifest, previousRelease } from "./versions";

const MARK = { added: "+", removed: "−", modified: "~" } as const;
const COLOR = { added: "text-ok", removed: "text-danger", modified: "text-warn" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-tau-meta border-line-2 grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-t px-4 py-2 first:border-t-0">
      <span className="text-ink-3">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface Baseline {
  version: string;
  size: number;
  manifest: PackageManifest;
}

type DiffProps = { submission: Submission; manifest: PackageManifest };

function DiffPanel({
  submission,
  manifest,
  pending,
  failed,
  previous,
  more,
}: DiffProps & {
  pending: boolean;
  failed: boolean;
  previous: Baseline | null;
  /** 已加载的版本里没有更低版本、但还有更早一页时的加载入口。 */
  more?: { loading: boolean; onLoad: () => void } | null;
}) {
  const commit = submission.commit?.slice(0, 7);
  let body;
  if (pending) body = <Loading minHeight={96} />;
  else if (failed)
    body = <p className="text-tau-sm text-ink-3 px-4 py-3">已发布版本读取失败，无法对比。</p>;
  else if (!previous && more)
    body = (
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="text-tau-sm text-ink-2">已加载的版本都不低于本次提交。</p>
        <Button loading={more.loading} onClick={more.onLoad}>
          加载更早的版本
        </Button>
      </div>
    );
  else if (!previous)
    body = (
      <p className="text-tau-sm text-ink-2 px-4 py-3">
        这是该插件的首次发布，没有可对比的版本。请重点看 README 与完整文件清单。
      </p>
    );
  else {
    const fields = diffManifest(previous.manifest, manifest);
    const files = diffFiles(previous.manifest, manifest);
    body = (
      <>
        <Row label="版本">
          <span className="font-tau-mono">
            <span className="text-ink-3 line-through">{previous.version}</span> → {manifest.version}
          </span>
        </Row>
        {fields.map(field => (
          <Row key={field.label} label={field.label}>
            <span className="text-ink-3 line-through">{field.before}</span>
            <span className="text-ink-1"> → {field.after}</span>
          </Row>
        ))}
        <Row label="上一版大小">{formatBytes(previous.size)}</Row>
        <Row label={`文件变化 ${files.length}`}>
          {files.length ? (
            <ul className="font-tau-mono text-tau-sm flex flex-col gap-0.5">
              {files.map(file => (
                <li key={file.path} className={cn("break-all", COLOR[file.change])}>
                  {MARK[file.change]} {file.path}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-ink-3">文件摘要与上一版完全一致</span>
          )}
        </Row>
      </>
    );
  }
  return (
    <Panel pad="none" className="overflow-hidden">
      <header className="border-line-1 flex flex-wrap items-center gap-2.5 border-b px-4 py-3">
        <GitCompare size={15} className="text-ink-3" />
        <h2 className="text-tau-body text-ink-1 font-semibold">与上一发布版本对比</h2>
        {previous && (
          <span className="text-tau-micro text-ink-3 font-tau-mono">
            v{previous.version} → v{manifest.version}
          </span>
        )}
        {submission.repository && commit && (
          <a
            href={
              previous
                ? `${submission.repository}/commits/${submission.commit}`
                : `${submission.repository}/tree/${submission.commit}`
            }
            target="_blank"
            rel="noreferrer"
            className="text-tau-sm text-accent-text ml-auto hover:underline"
          >
            源码快照 {commit} ↗
          </a>
        )}
      </header>
      {body}
    </Panel>
  );
}

function LegacyVersionDiff({ submission, manifest }: DiffProps) {
  const releases = usePluginReleases(manifest.id);
  return (
    <DiffPanel
      submission={submission}
      manifest={manifest}
      pending={releases.isPending}
      failed={releases.isError}
      previous={previousRelease(releases.data?.items, manifest.version)}
    />
  );
}

/** 跨端包的历史只在 v2 可见；v1 公开版本列表不含格式 3。 */
function PortableVersionDiff({ submission, manifest }: DiffProps) {
  const releases = useCenterVersions(manifest.id, "all");
  const items = releases.data?.pages.flatMap(page => page.items) ?? [];
  const previous = previousRelease(items, manifest.version);
  const baseline = previous && {
    version: previous.version,
    size: previous.size,
    manifest: previous.content.manifest,
  };
  const loaded = !releases.isPending && !releases.isError;
  return (
    <>
      <DiffPanel
        submission={submission}
        manifest={manifest}
        pending={releases.isPending}
        failed={releases.isError && !releases.data}
        previous={baseline}
        more={
          releases.hasNextPage
            ? {
                loading: releases.isFetchingNextPage,
                onLoad: () => void releases.fetchNextPage(),
              }
            : null
        }
      />
      {manifest.formatVersion === 3 && loaded && (previous || !releases.hasNextPage) && (
        <TargetsDiff
          previous={previous?.content.manifest.formatVersion === 3 ? previous.targets : null}
          current={manifest.targets}
          previousVersion={previous?.version ?? null}
        />
      )}
    </>
  );
}

/** 与上一发布版本对比：由已发布版本的 manifest 在前端计算，不需要额外接口 */
export function VersionDiff(props: DiffProps) {
  return props.manifest.formatVersion === 3 ? (
    <PortableVersionDiff {...props} />
  ) : (
    <LegacyVersionDiff {...props} />
  );
}
