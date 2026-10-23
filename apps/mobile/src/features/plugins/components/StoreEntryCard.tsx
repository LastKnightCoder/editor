import { useId } from "react";
import { Button } from "@tau/ui";
import type { CenterCompatibility } from "@tau/plugins/center";
import { AvailabilityNote } from "./AvailabilityNote";

/** 商店主动作的展示投影；是否允许与目标版本由逻辑层按已装版本和兼容结果给出。 */
export type StorePrimaryAction =
  | { kind: "install" | "update"; version: string; allowed: boolean; reason?: string }
  | { kind: "installed"; version: string }
  | { kind: "unavailable" };

export function StoreEntryCard({
  name,
  description,
  publisher,
  latestVersion,
  compatibleVersion,
  compatibility,
  primary,
  busy = false,
  onOpen,
  onPrimary,
}: {
  name: string;
  description: string;
  publisher: string;
  latestVersion: string;
  /** 此设备可安装的最高版本；null 表示没有兼容版本，不回退到 latest。 */
  compatibleVersion: string | null;
  compatibility: CenterCompatibility;
  primary: StorePrimaryAction;
  busy?: boolean;
  onOpen: () => void;
  onPrimary: () => void;
}) {
  const idPrefix = useId();
  const blocked =
    primary.kind === "unavailable" ||
    ((primary.kind === "install" || primary.kind === "update") && !primary.allowed);
  const note =
    (primary.kind === "install" || primary.kind === "update") && !primary.allowed
      ? primary.reason
      : undefined;
  return (
    <article
      aria-labelledby={`${idPrefix}-name`}
      className="bg-surface shadow-card rounded-card flex h-full flex-col gap-2 p-4"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-col gap-1 text-left active:opacity-70"
      >
        <h3 id={`${idPrefix}-name`} className="text-ink-1 truncate text-[15px] font-semibold">
          {name}
        </h3>
        <p className="text-ink-3 truncate text-[12px]">
          @{publisher} · 最新 v{latestVersion}
        </p>
        <p className="text-ink-2 line-clamp-2 text-[13px] leading-relaxed">{description}</p>
      </button>
      <AvailabilityNote
        latestVersion={latestVersion}
        compatibleVersion={compatibleVersion}
        compatibility={compatibility}
      />
      <div className="mt-auto flex items-center gap-2 pt-1">
        {primary.kind === "installed" ? (
          <span className="text-ink-3 text-[13px]">已安装 v{primary.version}</span>
        ) : primary.kind === "unavailable" ? (
          <span className="text-ink-3 text-[13px]">暂不可安装</span>
        ) : (
          <Button
            variant={primary.kind === "install" ? "primary" : "secondary"}
            className="min-h-11"
            disabled={blocked}
            loading={busy}
            aria-describedby={note ? `${idPrefix}-note` : undefined}
            onClick={onPrimary}
          >
            {primary.kind === "install" ? "安装" : "更新到"} v{primary.version}
          </Button>
        )}
      </div>
      {note && (
        <p id={`${idPrefix}-note`} className="text-ink-3 text-[12px]">
          {note}
        </p>
      )}
    </article>
  );
}
