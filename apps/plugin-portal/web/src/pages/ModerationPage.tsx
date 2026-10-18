import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDialog, Input, Panel, Select, Textarea } from "@tau/ui";
import type {
  ModerationAction,
  ModerationComment,
  ModerationFilter,
  ModerationInput,
} from "../../../contracts";
import { useApi } from "../app/api";
import { useSession } from "../app/session";
import { PageHeader } from "../components/PageHeader";
import { formatTime } from "../components/format";

const labels: Record<ModerationAction, string> = {
  delete_comment: "删除评论",
  suspend_visitor: "停用匿名身份",
  restore_visitor: "恢复匿名身份",
};
export function ModerationPage() {
  const session = useSession();
  if (session.isPending) return <p role="status">正在检查管理权限…</p>;
  if (session.isError)
    return (
      <div role="alert">
        {session.error.message}
        <Button onClick={() => void session.refetch()}>重试</Button>
      </div>
    );
  if (!session.data?.reviewer) return <p role="alert">只有管理员可以管理评论。</p>;
  return <ModerationContent />;
}
function ModerationContent() {
  const api = useApi(),
    client = useQueryClient();
  const [filter, setFilter] = useState<ModerationFilter>({
    pluginId: "",
    visitorId: "",
    status: "visible",
  });
  const [eventsOpen, setEventsOpen] = useState(false);
  const [target, setTarget] = useState<{ row: ModerationComment; action: ModerationAction } | null>(
    null
  );
  const [reason, setReason] = useState("");
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const comments = useInfiniteQuery({
    queryKey: ["moderation", "comments", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.listModerationComments(filter, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    enabled: !eventsOpen,
  });
  const events = useInfiniteQuery({
    queryKey: ["moderation", "events"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.listModerationEvents(pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    enabled: eventsOpen,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["moderation"] }),
      client.invalidateQueries({ queryKey: ["plugin-community"] }),
    ]);
  };
  const action = useMutation({
    mutationFn: (input: ModerationInput) => api.moderate(input),
    onSuccess: refresh,
  });
  const choose = (row: ModerationComment, choice: ModerationAction) => {
    action.reset();
    pending.current = null;
    setReason("");
    setTarget({ row, action: choice });
  };
  const query = eventsOpen ? events : comments;
  const rows = [
    ...new Map(
      comments.data?.pages.flatMap(page => page.items).map(row => [row.id, row]) ?? []
    ).values(),
  ];
  return (
    <>
      <PageHeader
        title="评论管理"
        meta="管理员处置公开评论与匿名身份，所有操作均记录原因。"
        actions={
          <Link to="/submissions" className="text-accent-text">
            返回发布审核
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Button onClick={() => setEventsOpen(value => !value)}>
          {eventsOpen ? "查看评论" : "操作记录"}
        </Button>
        <Button onClick={() => void query.refetch()}>刷新</Button>
        {!eventsOpen && (
          <>
            <Input
              aria-label="插件ID筛选"
              placeholder="插件ID（精确匹配）"
              value={filter.pluginId}
              onChange={event => setFilter({ ...filter, pluginId: event.target.value.trim() })}
            />
            <Input
              aria-label="匿名身份筛选"
              placeholder="匿名身份ID（精确匹配）"
              value={filter.visitorId}
              onChange={event => setFilter({ ...filter, visitorId: event.target.value.trim() })}
            />
            <Select
              aria-label="评论状态"
              value={filter.status}
              onValueChange={status =>
                setFilter({ ...filter, status: status as ModerationFilter["status"] })
              }
              options={[
                { value: "visible", label: "可见评论" },
                { value: "deleted", label: "已删除" },
                { value: "all", label: "全部" },
              ]}
            />
          </>
        )}
      </div>
      {query.isPending && <p role="status">正在读取…</p>}
      {query.isError && <p role="alert">{query.error.message}</p>}
      {!eventsOpen && (
        <div className="flex flex-col gap-4">
          {rows.map(row => (
            <Panel key={row.id} className="flex flex-col gap-3 p-5">
              <p className="text-tau-meta text-ink-2">
                {row.pluginId} · {formatTime(row.createdAt)} · {row.deleted ? "已删除" : "可见"}
              </p>
              <p className="whitespace-pre-wrap break-words">
                {row.deleted ? "正文已删除，无法恢复" : row.message}
              </p>
              <p className="text-tau-meta text-ink-3 break-all">
                匿名身份 {row.visitorId} · {row.suspended ? "已停用" : "正常"}
              </p>
              <div className="flex flex-wrap gap-2">
                {!row.deleted && (
                  <Button onClick={() => choose(row, "delete_comment")}>删除评论</Button>
                )}
                <Button
                  onClick={() => choose(row, row.suspended ? "restore_visitor" : "suspend_visitor")}
                >
                  {row.suspended ? "恢复匿名身份" : "停用匿名身份"}
                </Button>
                <Button
                  onClick={() =>
                    setFilter({ pluginId: "", visitorId: row.visitorId, status: "all" })
                  }
                >
                  查看此身份评论
                </Button>
              </div>
            </Panel>
          ))}
          {!comments.isPending && !comments.isError && !rows.length && <p>没有匹配的评论。</p>}
        </div>
      )}
      {eventsOpen &&
        !events.isPending &&
        !events.isError &&
        !events.data?.pages.some(page => page.items.length) && <p>暂无操作记录。</p>}
      {eventsOpen && (
        <div className="flex flex-col gap-4">
          {events.data?.pages
            .flatMap(page => page.items)
            .map(event => (
              <Panel key={event.id} className="flex flex-col gap-2 p-5">
                <p>
                  {labels[event.action]} · {formatTime(event.createdAt)}
                </p>
                <p className="text-tau-meta text-ink-3 break-all">
                  管理员 {event.reviewer} · 评论 {event.commentId} · 匿名身份 {event.visitorId}
                </p>
                <p className="whitespace-pre-wrap break-words">{event.reason}</p>
              </Panel>
            ))}
        </div>
      )}
      {query.hasNextPage && (
        <Button
          className="mt-4"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          加载更多
        </Button>
      )}
      <ConfirmDialog
        open={!!target}
        title={target ? labels[target.action] : "管理操作"}
        context={target?.row.pluginId}
        danger={target?.action !== "restore_visitor"}
        confirmText="确认处理"
        confirmDisabled={!reason.trim()}
        onOpenChange={open => {
          if (!open) setTarget(null);
        }}
        description={
          <div className="flex flex-col gap-3">
            <p>
              {target?.action === "delete_comment"
                ? "删除后正文立即清空，无法恢复。"
                : target?.action === "suspend_visitor"
                  ? "该匿名身份将不能继续评论或喜欢，已有内容保留。不能阻止用户清除数据后申请新身份。"
                  : "恢复后，该身份可继续评论和喜欢，已删除评论不会恢复。"}
            </p>
            <Textarea
              aria-label="处理原因"
              placeholder="请填写处理原因"
              maxLength={1000}
              value={reason}
              disabled={action.isPending}
              onChange={event => setReason(event.target.value)}
            />
            {action.isError && (
              <div role="alert">
                {action.error.message}
                <Button
                  onClick={() => {
                    setTarget(null);
                    void refresh();
                  }}
                >
                  关闭并刷新
                </Button>
              </div>
            )}
          </div>
        }
        onConfirm={async () => {
          if (!target) return;
          const input = {
            commentId: target.row.id,
            action: target.action,
            reason: reason.trim(),
            revision: target.action === "delete_comment" ? 0 : target.row.visitorRevision,
          };
          const signature = JSON.stringify(input);
          if (pending.current?.signature !== signature)
            pending.current = { signature, id: crypto.randomUUID() };
          await action.mutateAsync({ ...input, clientRequestId: pending.current.id });
        }}
      />
    </>
  );
}
