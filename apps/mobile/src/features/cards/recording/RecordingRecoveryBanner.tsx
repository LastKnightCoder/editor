import { useRecordingI18n } from "./recording.i18n";
import { useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryClient } from "../../../router/query/PageQueryProvider";
import { History } from "lucide-react";
import { Editor as SlateEditor, Element as SlateElement } from "slate";
import type { EditorRef } from "@tau/editor";
import { toast } from "../../../components/toast";
import {
  discardRecording,
  pendingRecordings,
  recoverRecording,
  type PendingRecording,
} from "../../../services/recording";
import { formatRecordingTime, formatRecordingStartedAt } from "./recording.format";
import { insertRecordingAt, recoveryInsertPath } from "./recordingTarget";
import { persistRecording, type RecordingPersistence } from "./recordingPersistence";

const pendingKey = (document: string) => ["recording", "pending", document] as const;

/** 进程被杀后遗留的录音：重新打开这篇文档时提示插回原位置或删除 */
export function RecordingRecoveryBanner(props: {
  document: string | null;
  editorRef: RefObject<EditorRef | null>;
  editable: boolean;
  persistence: () => RecordingPersistence;
}) {
  const { t, locale } = useRecordingI18n();
  const queryClient = getQueryClient();
  const document = props.document;
  const { data } = useQuery(
    {
      queryKey: pendingKey(document ?? ""),
      queryFn: () => (document ? pendingRecordings(document) : Promise.resolve([])),
      enabled: Boolean(document),
    },
    queryClient
  );
  const [busy, setBusy] = useState(false);
  const pending: PendingRecording | undefined = data?.[0];
  if (!pending || !document) return null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: pendingKey(document) });

  const insert = async () => {
    const editor = props.editorRef.current?.getEditor() as SlateEditor | undefined;
    if (!editor) return;
    setBusy(true);
    try {
      const persistence = props.persistence();
      const stored = await recoverRecording(pending.id);
      await persistRecording(persistence, pending.id, stored.src, src => {
        const [existing] = SlateEditor.nodes(editor, {
          at: [],
          match: node => SlateElement.isElement(node) && node.type === "audio" && node.src === src,
        });
        if (existing) return existing[1];
        return insertRecordingAt(
          editor,
          recoveryInsertPath(editor, pending.target.afterText),
          src,
          pending.title
        );
      });
      toast.success(t("recovery.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("recovery.failed"));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await discardRecording(pending.id);
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <div className="bg-surface shadow-card mt-3 mb-1 rounded-[14px] px-3 pt-3 pb-2.5 text-[13px] leading-relaxed">
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <span className="bg-danger-soft text-danger flex size-[30px] items-center justify-center rounded-[10px]">
          <History size={16} />
        </span>
        {t("recovery.title")}
      </div>
      <p className="text-ink-3 mt-1.5 mb-2.5 ml-[38px]">
        {t("recovery.hint", {
          started: formatRecordingStartedAt(pending.startedAt, locale),
          duration: pending.durationMs
            ? t("recovery.duration", { duration: formatRecordingTime(pending.durationMs, locale) })
            : "",
        })}
      </p>
      <div className="ml-[38px] flex gap-2">
        {props.editable ? (
          <button
            type="button"
            disabled={busy}
            className="bg-accent text-ink-inverse h-8 rounded-[10px] px-3 font-semibold disabled:opacity-50"
            onClick={() => void insert()}
          >
            {t("recovery.insert")}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          className="border-line-1 text-ink-2 h-8 rounded-[10px] border px-3 font-semibold disabled:opacity-50"
          onClick={() => void remove()}
        >
          {t("action.delete")}
        </button>
      </div>
    </div>
  );
}
