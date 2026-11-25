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
import { parseInvokeError } from "../../services/errors";
import type { HistoryApi } from "./core/document-history";

const textOf = (node: ContentNode): string =>
  node.text ?? node.children?.map(textOf).join("") ?? "";

export function ContentHistorySheet({ api, onClose }: { api: HistoryApi; onClose(): void }) {
  const [rows, setRows] = useState<DocumentHistoryEntry[]>();
  const [preview, setPreview] = useState<DocumentHistoryPreview>();
  const [sequence, select] = useState<number>();
  const [full, setFull] = useState(false);
  const [action, setAction] = useState<DocumentHistoryAction>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
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
        if (active) setError(parseInvokeError(failure).message || "编辑历史无法加载");
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
        if (active) setError(parseInvokeError(failure).message || "历史版本无法加载");
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
      setError(parseInvokeError(failure).message);
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
      setError(parseInvokeError(failure).message || "历史操作失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet
      open
      title="编辑历史"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <p>暂无编辑记录</p>}
      {rows && rows.length > 0 && (
        <div className="space-y-3">
          <select
            aria-label="历史版本"
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
                {row.actorName || "历史起点"} ·{" "}
                {row.startTime ? `${new Date(row.startTime).toLocaleString()} – ` : ""}
                {row.startTime
                  ? new Date(row.time).toLocaleTimeString()
                  : new Date(row.time).toLocaleString()}
                {row.kind === "undo" ? " · 撤销编辑" : row.kind === "restore" ? " · 恢复版本" : ""}
              </option>
            ))}
          </select>
          {more && <Button onClick={() => void older()}>加载更早记录</Button>}
          {!detail && !error && <Loading />}
          {detail && (
            <>
              <div className="flex gap-2">
                <Button aria-pressed={!full} onClick={() => setFull(false)}>
                  改动
                </Button>
                <Button aria-pressed={full} onClick={() => setFull(true)}>
                  完整正文
                </Button>
              </div>
              <div className="max-h-[45vh] overflow-y-auto">
                {full || (detail.entry.kind === "baseline" && !compare) ? (
                  <>
                    {compare && <p className="text-ink-3">恢复后对当前正文的改动</p>}
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
                        <p className="text-ink-3">
                          {
                            {
                              insert: "新增块",
                              delete: "删除块",
                              modify: "修改块",
                              move: "移动块",
                            }[change.kind]
                          }
                        </p>
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
                      取消
                    </Button>
                    <Button disabled={busy} variant="primary" onClick={() => void apply()}>
                      {action.kind === "undo" ? "确认撤销这次编辑" : "确认恢复到此版本"}
                    </Button>
                  </>
                ) : (
                  <>
                    {detail.canUndo && (
                      <Button onClick={() => prepare("undo")}>撤销这次编辑</Button>
                    )}
                    {detail.canRestore && (
                      <Button onClick={() => prepare("restore")}>恢复到此版本</Button>
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
