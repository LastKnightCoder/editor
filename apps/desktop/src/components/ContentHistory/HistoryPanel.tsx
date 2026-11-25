import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { X } from "lucide-react";
import { Button, FadeScroll, IconButton, cn } from "@tau/ui";
import type { DocumentHistoryEntry } from "@tau/collaboration";
import type { ContentHistoryController } from "./useContentHistory";
import { blockText } from "./HistoryMarks";
import { HistoryLinks } from "./HistoryLinks";
import { HistoryFullText } from "./HistoryFullText";

const CHANGE_LABELS = {
  insert: "新增块",
  delete: "删除块",
  modify: "修改块",
  move: "移动块",
} as const;

/** 作者色：actorId 稳定映射到五枚标签色（本机与他人一视同仁，身份靠名称与徽章） */
const actorTagClass = (actorId: string) => {
  let hash = 0;
  for (const ch of actorId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `bg-tag-${(hash % 5) + 1}`;
};

const relTime = (time: number) => {
  const mins = Math.round((Date.now() - time) / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  if (mins < 720) return `${Math.round(mins / 60)} 小时前`;
  const d = new Date(time);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

const absTime = (time: number) => {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const clock = (time: number) => {
  const d = new Date(time);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
/** 合并了一段连续编辑的记录显示起止时间 */
const entryTime = (entry: DocumentHistoryEntry) =>
  entry.startTime && clock(entry.startTime) !== clock(entry.time)
    ? `${absTime(entry.startTime)}–${clock(entry.time)}`
    : absTime(entry.time);

const dayLabel = (time: number) => {
  const d = new Date(time);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "今天";
  const yesterday = new Date(now.getTime() - 864e5);
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${weekday}`;
};

const firstLine = (text: string) => {
  const line = text.split("\n")[0];
  return line.length > 24 ? `${line.slice(0, 24)}…` : line;
};

/**
 * 编辑历史「页边注」面板：与正文同处一张纸的透明右栏（窄容器时退化为纸内右缘浮层）。
 * 时间轴按天分组；选中条目的明细与操作（撤销 / 恢复 / 全文 / 确认）都发生在条目展开区。
 */
export function HistoryPanel({
  history,
  containerRef,
}: {
  history: ContentHistoryController;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [fullText, setFullText] = useState(false);
  const [floating, setFloating] = useState(false);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const rows = history.rows;
  const selected = history.selected;
  const detail = history.preview;
  const confirming = history.confirming;

  /* 窄窗口放不下「正文 + 页边注」并排时退化为纸内右缘浮层（容器已 relative），不再挤窄正文 */
  useEffect(() => {
    const update = () => setFloating(window.innerWidth < 1120);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) if (!map.has(row.actorId)) map.set(row.actorId, row.actorName);
    return [...map.entries()];
  }, [rows]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const index = rows.findIndex(row => row.sequence === selected);
    const next = event.key === "ArrowUp" ? index - 1 : index + 1;
    if (index < 0 || next < 0 || next >= rows.length) return;
    event.preventDefault();
    history.select(rows[next].sequence);
  };

  const entryBadges = (row: DocumentHistoryEntry) => (
    <>
      {row.kind === "undo" && (
        <span className="bg-warn-soft text-warn rounded-full px-1.5 text-[10px] leading-4">
          撤销了 #{row.target}
        </span>
      )}
      {row.kind === "restore" && (
        <span className="bg-info-soft text-info rounded-full px-1.5 text-[10px] leading-4">
          恢复自 #{row.target}
        </span>
      )}
      {row.source && (
        <span className="bg-sunken text-ink-2 max-w-24 truncate rounded-full px-1.5 text-[10px] leading-4">
          {row.source}
        </span>
      )}
    </>
  );

  return (
    <aside
      aria-label="编辑历史"
      onKeyDown={onKeyDown}
      className={cn(
        "flex w-[292px] min-h-0 shrink-0 flex-col",
        floating
          ? "bg-surface shadow-lift rounded-tau-md absolute top-3 right-3 bottom-3 z-10 px-2 pt-3"
          : "pr-5 pt-10"
      )}
    >
      <header className="flex items-center gap-2 px-1 pb-1">
        <h2 className="text-tau-sm text-ink-3 font-semibold tracking-[0.2em]">编辑历史</h2>
        <span className="text-tau-meta text-ink-3 tabular-nums">{rows.length}</span>
        <IconButton
          title="收起历史面板"
          aria-label="收起历史面板"
          className="ml-auto size-6"
          onClick={history.close}
        >
          <X className="size-3.5" />
        </IconButton>
      </header>

      {actors.length > 1 && (
        <div className="flex flex-wrap gap-1 px-1 pb-1">
          <FilterChip
            active={!history.filterActor}
            label="全部"
            onClick={() => history.setFilterActor(undefined)}
          />
          {actors.map(([actorId, actorName]) => (
            <FilterChip
              key={actorId}
              active={history.filterActor === actorId}
              dotClass={actorTagClass(actorId)}
              label={actorName}
              onClick={() =>
                history.setFilterActor(history.filterActor === actorId ? undefined : actorId)
              }
            />
          ))}
        </div>
      )}

      {history.error && (
        <p
          className="text-tau-meta rounded-tau-sm bg-danger-soft text-danger mx-1 px-2 py-1"
          role="alert"
        >
          {history.error}
        </p>
      )}

      <FadeScroll className="min-h-0 flex-1 pl-1" topFade={false}>
        {history.isListPending && <p className="text-tau-meta text-ink-3 px-2 py-4">载入中…</p>}
        {!history.isListPending && !rows.length && (
          <p className="text-tau-meta text-ink-3 px-2 py-4">暂无编辑记录</p>
        )}
        {rows.map((row, index) => {
          const isSelected = row.sequence === selected;
          const isLast = index === rows.length - 1;
          const showDay =
            index === 0 ||
            new Date(rows[index - 1].time).toDateString() !== new Date(row.time).toDateString();
          return (
            <div key={row.sequence} className="relative">
              {showDay && (
                <p className="text-tau-sm bg-surface text-ink-3 sticky top-0 z-[1] px-2 pt-3 pb-1">
                  {dayLabel(row.time)}
                </p>
              )}
              {/* 时间轴脊线：穿过节点，组内首尾收口 */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-0 bottom-0 left-[6px] w-px bg-line-2",
                  index === 0 && "top-4",
                  isLast && "bottom-auto h-4"
                )}
              />
              <button
                type="button"
                ref={isSelected ? selectedRef : undefined}
                aria-current={isSelected}
                disabled={history.applyPending}
                onClick={() =>
                  isSelected && !confirming
                    ? history.clearSelection()
                    : history.select(row.sequence)
                }
                className={cn(
                  "relative block w-full rounded-tau-sm px-2 py-1.5 pl-5 text-left",
                  "hover:bg-hover transition-colors duration-150",
                  isSelected && "bg-selected"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-2.5 left-[2px] size-2 rounded-full border-2 border-surface transition-transform",
                    actorTagClass(row.actorId),
                    isSelected &&
                      "scale-125 ring-2 ring-accent-soft ring-offset-1 ring-offset-surface"
                  )}
                />
                <span className="flex items-baseline gap-1.5">
                  <span className="text-tau-body truncate font-medium">
                    {row.kind === "baseline" ? "历史起点" : row.actorName}
                  </span>
                  <span className="flex min-w-0 items-center gap-1">{entryBadges(row)}</span>
                  <span className="text-tau-sm text-ink-3 ml-auto shrink-0 tabular-nums">
                    {relTime(row.time)}
                  </span>
                </span>
              </button>
              {isSelected && <EntryDetail history={history} onFullText={() => setFullText(true)} />}
            </div>
          );
        })}
        {history.hasNextPage && (
          <button
            type="button"
            className="text-tau-sm text-ink-3 hover:text-ink-1 mt-2 ml-5 px-2 py-1"
            disabled={history.isFetchingNextPage}
            onClick={history.fetchNextPage}
          >
            {history.isFetchingNextPage ? "载入中…" : "更早的记录…"}
          </button>
        )}
      </FadeScroll>

      <HistoryLinks containerRef={containerRef} getAnchor={() => selectedRef.current} />
      {fullText && <HistoryFullText preview={detail} onClose={() => setFullText(false)} />}
    </aside>
  );
}

function FilterChip({
  active,
  label,
  dotClass,
  onClick,
}: {
  active: boolean;
  label: string;
  dotClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "text-tau-sm flex h-5 items-center gap-1 rounded-full px-2 transition-colors duration-150",
        active ? "bg-selected text-accent-text" : "text-ink-2 hover:bg-hover"
      )}
    >
      {dotClass && <span aria-hidden className={cn("size-1.5 rounded-full", dotClass)} />}
      {label}
    </button>
  );
}

/** 选中条目的展开区：明细 + 操作 + 两段式确认都发生在上下文里 */
function EntryDetail({
  history,
  onFullText,
}: {
  history: ContentHistoryController;
  onFullText: () => void;
}) {
  const detail = history.preview;
  const entry = detail?.entry;
  const confirming = history.confirming;
  if (!detail || !entry) return <p className="text-tau-sm text-ink-3 px-2 py-2">载入中…</p>;

  const isHead = entry.sequence === history.headSequence;
  const canUndo = detail.canUndo;
  const canRestore = detail.canRestore;

  return (
    <div className="mx-1 mt-1 mb-2 pl-5">
      <p className="text-tau-sm text-ink-3 tabular-nums">
        #{entry.sequence} · {entryTime(entry)}
      </p>

      {detail.previousTitle !== detail.value.title && (
        <p className="text-tau-sm text-ink-2 mt-2">
          修改标题 <del className="text-danger">{detail.previousTitle}</del> {detail.value.title}
        </p>
      )}

      <div className="mt-1.5 space-y-0.5">
        {detail.changes.map((change, index) => (
          <p
            key={`${change.blockId}:${change.kind}`}
            className="text-tau-sm text-ink-2 flex items-baseline gap-1.5"
          >
            <span className="border-line-1 bg-surface text-accent-text flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold">
              {index + 1}
            </span>
            <span className="text-ink-3 shrink-0">{CHANGE_LABELS[change.kind]}</span>
            <span className="truncate">{firstLine(blockText(change.after ?? change.before))}</span>
          </p>
        ))}
        {!detail.changes.length && detail.previousTitle === detail.value.title && (
          <p className="text-tau-sm text-ink-3">这条记录没有可见的正文变化</p>
        )}
      </div>

      {confirming ? (
        <div className="mt-2.5">
          <p className="text-tau-body font-medium">
            {confirming.kind === "undo" ? "确认撤销这次编辑？" : `确认恢复到 #${entry.sequence}？`}
          </p>
          <p className="text-tau-sm text-ink-2 mt-0.5">
            {confirming.kind === "undo"
              ? "只回退这条记录中的修改，其余编辑保持不变。"
              : `正文将回到该版本，之后的历史记录不会丢失。`}
          </p>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" disabled={history.applyPending} onClick={history.cancelConfirm}>
              取消
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={history.applyPending}
              loading={history.applyPending}
              onClick={history.applyAction}
            >
              {confirming.kind === "undo" ? "确认撤销" : "确认恢复"}
            </Button>
          </div>
        </div>
      ) : (
        !history.isPreviewPending && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" onClick={onFullText}>
              该版本全文
            </Button>
            {canUndo && (
              <Button size="sm" onClick={() => history.beginConfirm("undo")}>
                撤销这次编辑
              </Button>
            )}
            {canRestore && !isHead && (
              <Button size="sm" variant="soft" onClick={() => history.beginConfirm("restore")}>
                恢复到此版本
              </Button>
            )}
          </div>
        )
      )}

      {isHead && !confirming && <p className="text-tau-sm text-ink-3 mt-1.5">这是当前版本</p>}
    </div>
  );
}
