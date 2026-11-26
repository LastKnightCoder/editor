// 整库覆盖：以一侧为准整体上传或下载；覆盖较新一侧时在确认面板里警示。

import { formatDatabaseSyncStatus } from "@tau/shared/sync-progress";
import { syncTranslator, useSyncI18n, type SyncMessageKey, syncDisplayContext } from "./i18n";
import { useState } from "react";
import { ProgressStatus } from "@tau/ui";
import {
  ArrowRight,
  ChevronRight,
  Cloud,
  CloudDownload,
  CloudUpload,
  Smartphone,
} from "lucide-react";
import type { SyncActionResponse, SyncVersionResponse, SyncProgress } from "../../../types";
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
  syncProgress?: SyncProgress | null;
  onSyncUpload: () => Promise<SyncActionResponse>;
  onSyncDownload: () => Promise<SyncActionResponse>;
};

const COPY: Record<
  Direction,
  { title: SyncMessageKey; confirm: SyncMessageKey; loss: SyncMessageKey }
> = {
  upload: {
    title: "overwrite.useLocalTitle",
    confirm: "overwrite.holdRemote",
    loss: "overwrite.remoteWarning",
  },
  download: {
    title: "overwrite.useRemoteTitle",
    confirm: "overwrite.holdLocal",
    loss: "overwrite.localWarning",
  },
};

function Endpoint(props: { kind: "local" | "cloud"; version: number | null; target: boolean }) {
  useSyncI18n();
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
      <span className="text-ink-1 text-tau-meta block font-semibold">
        {props.kind === "local"
          ? syncTranslator.t("endpoint.local")
          : syncTranslator.t("endpoint.cloud")}
      </span>
      <span
        className={`text-tau-sm tabular-nums ${props.target ? "text-danger line-through" : "text-ink-2"}`}
      >
        v{props.version ?? "?"}
      </span>
    </div>
  );
}

export function OverwriteSection(props: OverwriteSectionProps) {
  const { locale } = useSyncI18n();
  const [pending, setPending] = useState<Direction | null>(null);
  const [running, setRunning] = useState(false);
  const local = props.versions?.localVersion ?? null;
  const remote = props.versions?.remoteVersion ?? null;
  const busy = props.isSyncing || running;

  const run = async (direction: Direction) => {
    setPending(null);
    setRunning(true);
    try {
      if (direction === "upload") await props.onSyncUpload();
      else await props.onSyncDownload();
      toast.success(
        syncTranslator.t(
          direction === "upload" ? "feedback.overwroteRemote" : "feedback.overwroteLocal"
        )
      );
    } catch (error) {
      toast.error(resolveSyncErrorMessage(error, syncTranslator.t("error.overwrite")));
    } finally {
      setRunning(false);
    }
  };

  const rows: Array<{ direction: Direction; label: string; detail: string }> = [
    {
      direction: "upload",
      label: syncTranslator.t("overwrite.useLocal"),
      detail: syncTranslator.t("overwrite.uploadDetail", {
        local: local ?? "?",
        remote: remote ?? "?",
      }),
    },
    {
      direction: "download",
      label: syncTranslator.t("overwrite.useRemote"),
      detail: syncTranslator.t("overwrite.downloadDetail", {
        remote: remote ?? "?",
        local: local ?? "?",
      }),
    },
  ];

  return (
    <div className="page-enter space-y-1">
      <GroupNote className="pt-1 pb-2">{syncTranslator.t("overwrite.description")}</GroupNote>
      {props.isSyncing && props.syncProgress && (
        <div className="setting-group px-[18px] py-4">
          <ProgressStatus
            value={props.syncProgress.value}
            label={formatDatabaseSyncStatus(props.syncProgress.status, locale)}
          />
        </div>
      )}
      <GroupCard>
        {rows.map(row => {
          const availability = overwriteAvailability(
            props.versions,
            row.direction,
            syncDisplayContext()
          );
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
                <span className="text-ink-1 text-tau-body block font-medium">{row.label}</span>
                <span className="text-ink-3 text-tau-sm block truncate tabular-nums">
                  {availability.reason ?? row.detail}
                </span>
              </span>
              <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
            </GroupRow>
          );
        })}
      </GroupCard>
      <GroupNote>{syncTranslator.t("overwrite.loss")}</GroupNote>

      <BottomSheet
        open={pending !== null}
        title={pending ? syncTranslator.t(COPY[pending].title) : ""}
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
            <p className="text-ink-2 text-tau-sm pb-4 text-center leading-relaxed">
              {overwriteAvailability(props.versions, pending, syncDisplayContext()).warning && (
                <span className="text-danger block font-semibold">
                  {overwriteAvailability(props.versions, pending, syncDisplayContext()).warning}
                </span>
              )}
              {syncTranslator.t(COPY[pending].loss)}
            </p>
            <HoldToConfirmButton
              label={syncTranslator.t(COPY[pending].confirm)}
              disabled={busy}
              onConfirm={() => void run(pending)}
            />
            <button
              type="button"
              onClick={() => setPending(null)}
              className="text-ink-2 active:bg-hover text-tau-body mt-1.5 h-11 w-full rounded-[14px] font-semibold"
            >
              {syncTranslator.t("action.cancel")}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
