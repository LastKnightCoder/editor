// 整库覆盖：以一侧为准整体上传或下载；覆盖较新一侧时在确认面板里警示。

import { useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  Cloud,
  CloudDownload,
  CloudUpload,
  Smartphone,
} from "lucide-react";
import type { SyncActionResponse, SyncVersionResponse } from "../../../types";
import { BottomSheet } from "../../../components/BottomSheet";
import { toast } from "../../../components/toast";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { HoldToConfirmButton } from "./HoldToConfirmButton";
import { resolveSyncErrorMessage } from "./syncErrors";
import { overwriteAvailability } from "./syncState";

type Direction = "upload" | "download";

export type OverwriteSectionProps = {
  versions: SyncVersionResponse | null;
  isSyncing: boolean;
  onSyncUpload: () => Promise<SyncActionResponse>;
  onSyncDownload: () => Promise<SyncActionResponse>;
};

const COPY: Record<Direction, { title: string; confirm: string; loss: string }> = {
  upload: {
    title: "以本机为准？",
    confirm: "按住覆盖云端",
    loss: "云端现有的数据库将被本机版本替换，无法撤销。",
  },
  download: {
    title: "以云端为准？",
    confirm: "按住覆盖本机",
    loss: "本机自上次同步后的修改将被云端版本替换，无法撤销。",
  },
};

function Endpoint(props: { kind: "local" | "cloud"; version: number | null; target: boolean }) {
  const Icon = props.kind === "local" ? Smartphone : Cloud;
  return (
    <div className="w-[88px] text-center">
      <span
        className={`mx-auto mb-1.5 grid h-11 w-11 place-items-center rounded-[14px] ${
          props.target ? "bg-danger-soft text-danger" : "bg-info-soft text-info"
        }`}
      >
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="text-ink-1 block text-[13px] font-semibold">
        {props.kind === "local" ? "本机" : "云端"}
      </span>
      <span
        className={`text-[12px] tabular-nums ${props.target ? "text-danger line-through" : "text-ink-2"}`}
      >
        v{props.version ?? "?"}
      </span>
    </div>
  );
}

export function OverwriteSection(props: OverwriteSectionProps) {
  const [pending, setPending] = useState<Direction | null>(null);
  const [running, setRunning] = useState(false);
  const local = props.versions?.localVersion ?? null;
  const remote = props.versions?.remoteVersion ?? null;
  const busy = props.isSyncing || running;

  const run = async (direction: Direction) => {
    setPending(null);
    setRunning(true);
    try {
      const result =
        direction === "upload" ? await props.onSyncUpload() : await props.onSyncDownload();
      toast.success(result.message || (direction === "upload" ? "已覆盖云端" : "已覆盖本机"));
    } catch (error) {
      toast.error(resolveSyncErrorMessage(error, "整库覆盖失败"));
    } finally {
      setRunning(false);
    }
  };

  const rows: Array<{ direction: Direction; label: string; detail: string }> = [
    {
      direction: "upload",
      label: "以本机为准",
      detail: `上传 v${local ?? "?"} · 覆盖云端 v${remote ?? "?"}`,
    },
    {
      direction: "download",
      label: "以云端为准",
      detail: `下载 v${remote ?? "?"} · 覆盖本机 v${local ?? "?"}`,
    },
  ];

  return (
    <div className="page-enter space-y-1">
      <GroupNote className="pt-1 pb-2">
        日常使用同步页的主按钮即可。只有一侧数据出了问题、需要强制以另一侧为准时，才使用整库覆盖。
      </GroupNote>
      <GroupCard>
        {rows.map(row => {
          const availability = overwriteAvailability(props.versions, row.direction);
          const Icon = row.direction === "upload" ? CloudUpload : CloudDownload;
          return (
            <GroupRow
              key={row.direction}
              disabled={busy || !availability.enabled}
              onClick={() => setPending(row.direction)}
              className={!availability.enabled ? "opacity-55" : ""}
            >
              <span className="bg-tag-5-soft text-tag-5 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 block text-[14.5px] font-medium">{row.label}</span>
                <span className="text-ink-3 block truncate text-[11.5px] tabular-nums">
                  {availability.reason ?? row.detail}
                </span>
              </span>
              <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
            </GroupRow>
          );
        })}
      </GroupCard>
      <GroupNote>被覆盖一侧未同步的修改会丢失，且无法撤销。</GroupNote>

      <BottomSheet
        open={pending !== null}
        title={pending ? COPY[pending].title : ""}
        onClose={() => setPending(null)}
      >
        {pending && (
          <div className="pb-1">
            <div className="flex items-center justify-center gap-4 py-3">
              <Endpoint
                kind={pending === "upload" ? "local" : "cloud"}
                version={pending === "upload" ? local : remote}
                target={false}
              />
              <ArrowRight size={22} className="text-danger" aria-hidden="true" />
              <Endpoint
                kind={pending === "upload" ? "cloud" : "local"}
                version={pending === "upload" ? remote : local}
                target
              />
            </div>
            <p className="text-ink-2 pb-4 text-center text-[12.5px] leading-relaxed">
              {overwriteAvailability(props.versions, pending).warning && (
                <span className="text-danger block font-semibold">
                  {overwriteAvailability(props.versions, pending).warning}
                </span>
              )}
              {COPY[pending].loss}
            </p>
            <HoldToConfirmButton
              label={COPY[pending].confirm}
              disabled={busy}
              onConfirm={() => void run(pending)}
            />
            <button
              type="button"
              onClick={() => setPending(null)}
              className="text-ink-2 active:bg-hover mt-1.5 h-11 w-full rounded-[14px] text-[15px] font-semibold"
            >
              取消
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
