import type { CenterTargets } from "@tau/plugins/center";
import { Panel } from "@tau/ui";
import { PLATFORM_LABELS } from "../catalog/platforms";
import { diffTargets } from "./targetChanges";

const KIND = {
  added: { label: "新增平台", className: "text-ok" },
  removed: { label: "移除平台", className: "text-danger" },
  changed: { label: "声明变化", className: "text-warn" },
} as const;

/** 作者与审核者看到的平台声明变化；资料只读，修改须重新打包上传。 */
export function TargetsDiff({
  previous,
  current,
  previousVersion,
}: {
  /** 上一发布版本的目标；首次发布或上一版为旧格式时为 null。 */
  previous: CenterTargets | null;
  current: CenterTargets;
  previousVersion: string | null;
}) {
  const changes = previous ? diffTargets(previous, current) : [];
  return (
    <Panel pad="none" className="overflow-hidden">
      <header className="border-line-1 flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h2 className="text-tau-body text-ink-1 font-semibold">平台声明变化</h2>
        {previousVersion && (
          <span className="text-tau-micro text-ink-3 font-tau-mono">对比 v{previousVersion}</span>
        )}
      </header>
      {!previous ? (
        <p className="text-tau-sm text-ink-2 px-4 py-3">
          {previousVersion
            ? `上一版 v${previousVersion} 不含跨端平台声明，请逐个核对本版声明的平台。`
            : "首次声明平台，请逐个核对本版声明的平台。"}
        </p>
      ) : !changes.length ? (
        <p className="text-tau-sm text-ink-3 px-4 py-3">平台声明与上一版一致。</p>
      ) : (
        <ul className="divide-line-2 flex flex-col divide-y">
          {changes.map(change => (
            <li
              key={change.platform}
              className="text-tau-meta grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-2"
            >
              <span className="text-ink-1 font-semibold">{PLATFORM_LABELS[change.platform]}</span>
              <div className="min-w-0">
                <p className={KIND[change.kind].className}>{KIND[change.kind].label}</p>
                {change.lines.length > 0 && (
                  <ul className="text-ink-2 mt-0.5 flex flex-col gap-0.5">
                    {change.lines.map(line => (
                      <li key={line} className="break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
