// 对话记录：只列「对话」作用域（与桌面主对话同一份），按今天 / 本周 / 更早分组；左滑删除，长按重命名或删除。
// 后台还在生成的会话带脉冲点。数据按当前库读取，切库后随之切换。

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil, SquarePen, Trash2 } from "lucide-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ActionSheet } from "../../components/ActionSheet";
import { BottomSheet } from "../../components/BottomSheet";
import { GroupLabel } from "../../components/GroupLabel";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { toast } from "../../components/toast";
import { useEdgeFade } from "../../hooks/useScrollState";
import { useAppContext } from "../../app/AppContext";
import { useNavigator } from "../../router";
import {
  CONTENT_CHAT_SCOPE,
  listChats,
  removeChat,
  renameChat,
  useChatStore,
} from "../../services/aiChat/chatController";

const DAY = 86_400_000;
const SWIPE_OPEN_PX = 72;

type Row = {
  id: string;
  title: string;
  updateTime: number;
  messageCount: number;
  /** 就近对话的来源内容 */
  contentId: number | null;
};

function bucketOf(time: number, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (time >= today) return "今天";
  if (time >= today - 6 * DAY) return "本周";
  return "更早";
}

function timeLabel(time: number, now = new Date()) {
  const date = new Date(time);
  if (bucketOf(time, now) === "今天")
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (bucketOf(time, now) === "本周")
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 左滑露出删除：只跟踪横向拖动，纵向滚动交给列表 */
const LONG_PRESS_MS = 450;

function SwipeRow(props: {
  onOpen(): void;
  onDelete(): void;
  onMenu(): void;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; base: number; horizontal?: boolean } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const cancelPress = () => {
    if (pressTimer.current != null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  useEffect(() => cancelPress, []);
  return (
    <div className="[&+&]:before:bg-line-1 relative overflow-hidden [&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:right-0 [&+&]:before:left-[14px] [&+&]:before:z-10 [&+&]:before:h-px">
      <button
        type="button"
        aria-label="删除对话"
        onClick={props.onDelete}
        className="bg-danger absolute inset-y-0 right-0 grid w-[72px] place-items-center text-white"
      >
        <Trash2 size={18} aria-hidden="true" />
      </button>
      <div
        role="button"
        tabIndex={0}
        // pan-y：纵向滚动仍归浏览器，横向拖动留给这里；否则一动手指就被接管成滚动并 pointercancel
        className="bg-surface relative flex touch-pan-y items-start gap-3 px-[14px] py-2.5 transition-transform duration-200 select-none"
        style={{ transform: `translateX(${offset}px)` }}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => {
          start.current = { x: event.clientX, y: event.clientY, base: offset };
          longPressed.current = false;
          pressTimer.current = window.setTimeout(() => {
            pressTimer.current = null;
            longPressed.current = true;
            start.current = null;
            navigator.vibrate?.(10);
            props.onMenu();
          }, LONG_PRESS_MS);
        }}
        onPointerMove={event => {
          const s = start.current;
          if (!s) return;
          const dx = event.clientX - s.x;
          if (s.horizontal === undefined && Math.abs(dx) + Math.abs(event.clientY - s.y) > 8) {
            s.horizontal = Math.abs(dx) > Math.abs(event.clientY - s.y);
            cancelPress();
          }
          if (s.horizontal) setOffset(Math.min(0, Math.max(-SWIPE_OPEN_PX, s.base + dx)));
        }}
        onPointerUp={() => {
          cancelPress();
          const s = start.current;
          start.current = null;
          if (longPressed.current) return;
          if (s?.horizontal) setOffset(offset < -SWIPE_OPEN_PX / 2 ? -SWIPE_OPEN_PX : 0);
          else if (offset) setOffset(0);
          else props.onOpen();
        }}
        onPointerCancel={() => {
          cancelPress();
          start.current = null;
          setOffset(0);
        }}
        onKeyDown={event => event.key === "Enter" && props.onOpen()}
      >
        {props.children}
      </div>
    </div>
  );
}

function RenameSheet(props: { row: Row | null; onCancel(): void; onSubmit(title: string): void }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (props.row) setValue(props.row.title);
  }, [props.row]);
  return (
    <BottomSheet open={!!props.row} title="重命名对话" onClose={props.onCancel}>
      <form
        className="px-5 pb-5"
        onSubmit={event => {
          event.preventDefault();
          props.onSubmit(value);
        }}
      >
        <input
          aria-label="对话标题"
          value={value}
          maxLength={60}
          autoFocus
          onChange={event => setValue(event.currentTarget.value)}
          className="bg-page text-ink-1 text-tau-body h-11 w-full rounded-[12px] px-3.5 outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="bg-accent text-ink-inverse text-tau-body mt-3 h-11 w-full rounded-[12px] font-semibold disabled:opacity-50"
        >
          保存
        </button>
      </form>
    </BottomSheet>
  );
}

export function ChatHistoryPage() {
  const navigator = useNavigator();
  const queryClient = useQueryClient();
  const databaseName = useAppContext().syncSettings.safeSetting?.database?.active ?? "";
  const running = useChatStore(state => state.chats);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });
  const [removing, setRemoving] = useState<Row | null>(null);
  const [menu, setMenu] = useState<Row | null>(null);
  const [renaming, setRenaming] = useState<Row | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["aiChat", "history", databaseName],
    enabled: !!databaseName,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listChats(databaseName, pageParam),
    getNextPageParam: page => (page.hasMore ? page.nextOffset : undefined),
  });
  const rows: Row[] = (query.data?.pages ?? []).flatMap(page =>
    page.items.map(item => ({
      id: item.id,
      title: item.title || "新对话",
      updateTime: item.updateTime,
      messageCount: item.messageCount,
      contentId:
        item.scope === CONTENT_CHAT_SCOPE && item.domainRef?.startsWith("content:")
          ? Number(item.domainRef.slice("content:".length)) || null
          : null,
    }))
  );
  // 一页可能全是其他功能的会话、过滤后为空：还有下一页就继续取，直到凑出内容或取完
  useEffect(() => {
    if (!query.isFetching && query.hasNextPage && rows.length < 12) void query.fetchNextPage();
  }, [query, rows.length]);
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = bucketOf(row.updateTime);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const remove = async () => {
    if (!removing) return;
    try {
      await removeChat(databaseName, removing.id);
      await queryClient.invalidateQueries({ queryKey: ["aiChat", "history", databaseName] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setRemoving(null);
    }
  };

  const rename = async (title: string) => {
    const row = renaming;
    setRenaming(null);
    if (!row || !title.trim() || title.trim() === row.title) return;
    try {
      await renameChat(databaseName, row.id, title.trim());
      await queryClient.invalidateQueries({ queryKey: ["aiChat", "history", databaseName] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重命名失败");
    }
  };

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title="对话记录"
        onBack={() => void navigator.goBack("ui")}
        actions={
          <PageHeaderButton
            icon={<SquarePen size={19} />}
            aria-label="新对话"
            onClick={() => navigator.push("aiChat", { sessionId: crypto.randomUUID(), isNew: "1" })}
          />
        }
      />
      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
        onScroll={event => {
          const node = event.currentTarget;
          if (
            query.hasNextPage &&
            !query.isFetchingNextPage &&
            node.scrollHeight - node.scrollTop - node.clientHeight < 200
          )
            void query.fetchNextPage();
        }}
      >
        {query.isLoading ? null : rows.length === 0 ? (
          <p className="text-ink-3 text-tau-meta px-8 py-16 text-center">
            还没有对话。在「今天」页的问答条里问一句试试。
          </p>
        ) : (
          [...groups].map(([label, items]) => (
            <section key={label}>
              <GroupLabel>{label}</GroupLabel>
              <div className="setting-group">
                {items.map(row => {
                  const live = !!running[row.id]?.runId;
                  return (
                    <SwipeRow
                      key={row.id}
                      onOpen={() => navigator.push("aiChat", { sessionId: row.id })}
                      onDelete={() => setRemoving(row)}
                      onMenu={() => setMenu(row)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-ink-1 text-tau-body flex items-center gap-1.5 font-medium">
                          {live && (
                            <span
                              aria-label="正在生成"
                              className="bg-accent pulse-soft h-[7px] w-[7px] shrink-0 rounded-full"
                            />
                          )}
                          <span className="truncate">{row.title}</span>
                        </span>
                        <span className="text-ink-3 text-tau-sm block truncate">
                          {live
                            ? "正在生成…"
                            : row.contentId
                              ? `来自笔记 · ${row.messageCount} 次提问`
                              : `${row.messageCount} 次提问`}
                        </span>
                      </span>
                      <span className="text-ink-3 text-tau-sm shrink-0 pt-0.5 tabular-nums">
                        {timeLabel(row.updateTime)}
                      </span>
                    </SwipeRow>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
      <ActionSheet
        open={!!menu}
        title={menu?.title}
        items={[
          {
            label: "重命名",
            icon: <Pencil size={18} />,
            onClick: () => setRenaming(menu),
          },
          {
            label: "删除",
            icon: <Trash2 size={18} />,
            danger: true,
            onClick: () => setRemoving(menu),
          },
        ]}
        onClose={() => setMenu(null)}
      />
      <RenameSheet row={renaming} onCancel={() => setRenaming(null)} onSubmit={rename} />
      <MobileConfirmDialog
        open={!!removing}
        title={`删除「${removing?.title ?? ""}」？`}
        description="对话记录会从这台设备删除，同步后其他设备也会删除。"
        confirmText="删除"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
