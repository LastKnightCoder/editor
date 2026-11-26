import { useEffect, useState } from "react";
import { Button, Loading } from "@tau/ui";
import { Editor } from "@tau/editor";
import type { Descendant } from "slate";
import type {
  ContentNode,
  DocumentHistoryAction,
  DocumentHistoryEntry,
  DocumentHistoryPreview,
} from "@tau/collaboration";
import { BottomSheet } from "../../components/BottomSheet";
import { useMobileContentKit } from "../../services/editorKit";
import { useHistoryI18n, historyErrorText, type HistoryIssue } from "./history.i18n";
import type { HistoryApi } from "./core/document-history";

const textOf = (node: ContentNode): string =>
  node.text ?? node.children?.map(textOf).join("") ?? "";

export function ContentHistorySheet({ api, onClose }: { api: HistoryApi; onClose(): void }) {
  const context = useHistoryI18n();
  const { t, locale } = context;
  const [rows, setRows] = useState<DocumentHistoryEntry[]>();
  const [preview, setPreview] = useState<DocumentHistoryPreview>();
  const [sequence, select] = useState<number>();
  const [full, setFull] = useState(false);
  const [action, setAction] = useState<DocumentHistoryAction>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HistoryIssue>();
  const [more, setMore] = useState(false);
  const kit = useMobileContentKit("edit");
  const current = sequence ?? rows?.[0]?.sequence;
  const compare = action?.kind === "restore";

  useEffect(() => {
    let active = true;
    void api
      .list()
      .then(result => {
        if (!active) return;
        setRows(result);
        setMore(result.length === 50);
      })
      .catch(failure => {
        if (active) setError({ cause: failure, fallback: "error.list" });
      });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    if (current === undefined) return;
    let active = true;
    void api
      .preview(current, compare)
      .then(result => {
        if (active) setPreview(result);
      })
      .catch(failure => {
        if (active) setError({ cause: failure, fallback: "error.preview" });
      });
    return () => {
      active = false;
    };
  }, [api, current, compare]);
  const detail = preview?.entry.sequence === current ? preview : undefined;
  const older = async () => {
    try {
      const result = await api.list(rows?.at(-1)?.sequence);
      setRows(previous => [...(previous ?? []), ...result]);
      setMore(result.length === 50);
    } catch (failure) {
      setError({ cause: failure, fallback: "error.list" });
    }
  };
  const prepare = (kind: DocumentHistoryAction["kind"]) => {
    if (!detail) return;
    setError(undefined);
    if (kind === "restore") {
      setFull(false);
      setPreview(undefined);
    }
    setAction({
      operationId: crypto.randomUUID(),
      kind,
      sequence: detail.entry.sequence,
      expectedRevision: kind === "restore" ? detail.headRevision : undefined,
    });
  };
  const apply = async () => {
    if (!action || !detail || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.apply({ ...action, expectedRevision: compare ? detail.headRevision : undefined });
      onClose();
    } catch (failure) {
      setError({ cause: failure, fallback: "error.action" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet
      open
      title={t("title")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error && (
        <p className="text-danger" role="alert">
          {historyErrorText(error, context)}
        </p>
      )}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <p>{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <div className="space-y-3">
          <select
            aria-label={t("version")}
            disabled={busy}
            className="bg-surface rounded-tau-sm w-full p-2"
            value={current}
            onChange={event => {
              select(Number(event.currentTarget.value));
              setAction(undefined);
              setError(undefined);
            }}
          >
            {rows.map(row => (
              <option key={row.sequence} value={row.sequence}>
                {row.actorName || t("baseline")} ·{" "}
                {row.startTime ? `${new Date(row.startTime).toLocaleString(locale)} – ` : ""}
                {row.startTime
                  ? new Date(row.time).toLocaleTimeString(locale)
                  : new Date(row.time).toLocaleString(locale)}
                {row.kind === "undo"
                  ? ` · ${t("undoKind")}`
                  : row.kind === "restore"
                    ? ` · ${t("restoreKind")}`
                    : ""}
              </option>
            ))}
          </select>
          {more && <Button onClick={() => void older()}>{t("older")}</Button>}
          {!detail && !error && <Loading />}
          {detail && (
            <>
              <div className="flex gap-2">
                <Button aria-pressed={!full} onClick={() => setFull(false)}>
                  {t("changes")}
                </Button>
                <Button aria-pressed={full} onClick={() => setFull(true)}>
                  {t("fullText")}
                </Button>
              </div>
              <div className="max-h-[45vh] overflow-y-auto">
                {full || (detail.entry.kind === "baseline" && !compare) ? (
                  <>
                    {compare && <p className="text-ink-3">{t("restoreHint")}</p>}
                    {detail.value.title && <h3>{detail.value.title}</h3>}
                    {kit && (
                      <Editor
                        key={current}
                        kit={kit}
                        readonly
                        initValue={detail.value.content as Descendant[]}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {detail.previousTitle !== detail.value.title && (
                      <p>
                        <del>{detail.previousTitle}</del> → {detail.value.title}
                      </p>
                    )}
                    {detail.changes.map(change => (
                      <div
                        key={`${change.blockId}:${change.kind}`}
                        className="bg-surface rounded-tau-sm mb-2 p-2"
                      >
                        <p className="text-ink-3">{t(`change.${change.kind}`)}</p>
                        {change.before && change.kind !== "move" && (
                          <del className="text-danger block">{textOf(change.before)}</del>
                        )}
                        {change.after && <p>{textOf(change.after)}</p>}
                      </div>
                    ))}
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {action ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setAction(undefined);
                        setError(undefined);
                      }}
                    >
                      {t("cancel")}
                    </Button>
                    <Button disabled={busy} variant="primary" onClick={() => void apply()}>
                      {action.kind === "undo" ? t("confirm.undo") : t("confirm.restore")}
                    </Button>
                  </>
                ) : (
                  <>
                    {detail.canUndo && <Button onClick={() => prepare("undo")}>{t("undo")}</Button>}
                    {detail.canRestore && (
                      <Button onClick={() => prepare("restore")}>{t("restore")}</Button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
