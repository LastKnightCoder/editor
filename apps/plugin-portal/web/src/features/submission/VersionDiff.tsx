import { GitCompare } from "lucide-react";
import { Loading, Panel, cn } from "@tau/ui";
import type { PackageManifest, Submission } from "../../../../contracts";
import { usePluginReleases } from "../catalog/queries";
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

/** 与上一发布版本对比：由已发布版本的 manifest 在前端计算，不需要额外接口 */
export function VersionDiff({
  submission,
  manifest,
}: {
  submission: Submission;
  manifest: PackageManifest;
}) {
  const releases = usePluginReleases(manifest.id);
  const previous = previousRelease(releases.data?.items, manifest.version);
  const commit = submission.commit?.slice(0, 7);

  let body;
  if (releases.isPending) body = <Loading minHeight={96} />;
  else if (releases.isError)
    body = <p className="text-tau-sm text-ink-3 px-4 py-3">已发布版本读取失败，无法对比。</p>;
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
