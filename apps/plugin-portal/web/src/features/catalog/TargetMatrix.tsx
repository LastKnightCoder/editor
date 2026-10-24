import type { CenterTargets } from "@tau/plugins/center";
import { cn } from "@tau/ui";
import { PLATFORM_LABELS, PORTABLE_PLATFORMS, type PortablePlatform } from "./platforms";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3">
      <dt className="text-ink-3 pt-0.5">{label}</dt>
      <dd className="text-ink-1 min-w-0">{children}</dd>
    </div>
  );
}

/** 逐平台目标声明：资料只读取自包内 manifest，未声明的平台明确显示为不支持。 */
export function TargetMatrix({
  targets,
  highlight,
}: {
  targets: CenterTargets;
  /** 当前浏览的平台，突出显示。 */
  highlight?: PortablePlatform;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {PORTABLE_PLATFORMS.map(platform => {
        const target = targets[platform];
        const label = PLATFORM_LABELS[platform];
        return (
          <section
            key={platform}
            aria-label={`${label}目标`}
            className={cn(
              "border-line-1 rounded-tau-md text-tau-meta flex flex-col gap-2.5 border p-3.5",
              target ? "bg-surface" : "bg-page border-dashed",
              highlight === platform && "border-accent"
            )}
          >
            <header className="flex items-center justify-between gap-2">
              <h3 className="text-tau-body text-ink-1 font-semibold">{label}</h3>
              {!target && <span className="text-tau-sm text-ink-3">未声明</span>}
            </header>
            {target ? (
              <dl className="flex flex-col gap-2">
                <Row label="最低 Tau">
                  <span className="font-tau-mono">{target.minAppVersion}</span>
                </Row>
              </dl>
            ) : (
              <p className="text-tau-sm text-ink-3">此版本不支持{label}，不会向该平台推荐。</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
