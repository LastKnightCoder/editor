import { useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  ChevronDown,
  CloudOff,
  Ellipsis,
  Filter,
  Puzzle,
  RefreshCw,
  Trash2,
  UserCheck,
  UserX,
  VenetianMask,
  X,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
  IconButton,
  Loading,
  Menu,
  Panel,
  Tabs,
  Tag,
  Textarea,
  Tooltip,
  cn,
} from "@tau/ui";
import type {
  ModerationAction,
  ModerationComment,
  ModerationFilter,
  ModerationInput,
} from "../../../contracts";
import { useApi } from "../app/api";
import { useSession } from "../app/session";
import { errorMessage } from "../api/errors";
import { PageHeader } from "../components/PageHeader";
import { PluginMark } from "../components/PluginMark";
import { formatTime } from "../components/format";
import { ErrorState } from "../components/states";
import { uniqueEntries, useCatalog } from "../features/catalog/queries";

const LABELS: Record<ModerationAction, string> = {
  delete_comment: "删除评论",
  suspend_visitor: "停用匿名身份",
  restore_visitor: "恢复匿名身份",
};

const EFFECTS: Record<ModerationAction, string> = {
  delete_comment: "删除后正文立即清空，无法恢复。",
  suspend_visitor:
    "该匿名身份将不能继续评论或喜欢，已有内容保留。不能阻止用户清除数据后申请新身份。",
  restore_visitor: "恢复后，该身份可继续评论和喜欢，已删除评论不会恢复。",
};

const REASONS = ["广告引流", "人身攻击", "与插件无关", "重复刷屏"];
const STATUS_LABELS: Record<ModerationFilter["status"], string> = {
  visible: "可见评论",
  deleted: "已删除",
  all: "全部状态",
};

type Tab = "comments" | "events";

export function ModerationPage() {
  const session = useSession();
  if (session.isPending) return <Loading />;
  if (session.isError)
    return (
      <ErrorState
        icon={CloudOff}
        title="无法检查管理权限"
        error={session.error}
        onRetry={() => void session.refetch()}
      />
    );
  if (!session.data?.reviewer)
    return (
      <p role="alert" className="text-tau-body text-ink-2 py-16 text-center">
        只有管理员可以管理评论。
      </p>
    );
  return <ModerationContent />;
}

/** 插件 ID → 名称；目录首页之外的插件退化为显示 ID */
function usePluginNames() {
  const catalog = useCatalog("", null, "updated");
  const entries = uniqueEntries(catalog.data?.pages);
  return { entries, nameOf: (id: string) => entries.find(e => e.pluginId === id)?.name ?? id };
}

function ModerationContent() {
  const api = useApi();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("comments");
  const [filter, setFilter] = useState<ModerationFilter>({
    pluginId: "",
    visitorId: "",
    status: "visible",
  });
  const [target, setTarget] = useState<{ row: ModerationComment; action: ModerationAction } | null>(
    null
  );
  const [reason, setReason] = useState("");
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const { entries, nameOf } = usePluginNames();
  const comments = useInfiniteQuery({
    queryKey: ["moderation", "comments", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.listModerationComments(filter, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    enabled: tab === "comments",
  });
  const events = useInfiniteQuery({
    queryKey: ["moderation", "events"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.listModerationEvents(pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    enabled: tab === "events",
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["moderation"] }),
      client.invalidateQueries({ queryKey: ["plugin-community"] }),
    ]);
  const action = useMutation({
    mutationFn: (input: ModerationInput) => api.moderate(input),
    onSuccess: async () => {
      setTarget(null);
      await refresh();
    },
  });
  const choose = (row: ModerationComment, choice: ModerationAction) => {
    action.reset();
    pending.current = null;
    setReason("");
    setTarget({ row, action: choice });
  };
  const rows = [
    ...new Map(
      comments.data?.pages.flatMap(page => page.items).map(row => [row.id, row]) ?? []
    ).values(),
  ];
  const query = tab === "comments" ? comments : events;

  const filters = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Menu
        fit
        trigger={
          <Button size="sm" icon={Puzzle}>
            {filter.pluginId ? nameOf(filter.pluginId) : "全部插件"}
            <ChevronDown size={13} className="text-ink-3" />
          </Button>
        }
      >
        <Menu.RadioGroup
          value={filter.pluginId}
          onValueChange={pluginId => setFilter({ ...filter, pluginId })}
        >
          <Menu.RadioItem value="">全部插件</Menu.RadioItem>
          <Menu.Separator />
          {entries.map(entry => (
            <Menu.RadioItem key={entry.pluginId} value={entry.pluginId}>
              {entry.name}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu>
      <Menu
        trigger={
          <Button size="sm" icon={Filter}>
            {STATUS_LABELS[filter.status]}
            <ChevronDown size={13} className="text-ink-3" />
          </Button>
        }
      >
        <Menu.RadioGroup
          value={filter.status}
          onValueChange={status =>
            setFilter({ ...filter, status: status as ModerationFilter["status"] })
          }
        >
          {(Object.keys(STATUS_LABELS) as ModerationFilter["status"][]).map(status => (
            <Menu.RadioItem key={status} value={status}>
              {STATUS_LABELS[status]}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu>
      {filter.visitorId && (
        <span className="bg-accent-soft text-accent-text text-tau-sm inline-flex h-7 items-center gap-1.5 rounded-full pl-2.5 pr-1">
          <VenetianMask size={13} />
          只看 <span className="font-tau-mono">{filter.visitorId.slice(0, 10)}</span>
          <IconButton
            aria-label="清除身份筛选"
            className="size-5"
            onClick={() => setFilter({ ...filter, visitorId: "", status: "visible" })}
          >
            <X size={12} />
          </IconButton>
        </span>
      )}
      <Tooltip content="刷新">
        <IconButton aria-label="刷新" className="ml-auto" onClick={() => void query.refetch()}>
          <RefreshCw size={14} className={cn(query.isFetching && "animate-spin")} />
        </IconButton>
      </Tooltip>
    </div>
  );

  const commentTable = (
    <>
      {filters}
      {comments.isPending ? (
        <Loading minHeight={200} />
      ) : comments.isError && !comments.data ? (
        <ErrorState
          icon={CloudOff}
          title="评论读取失败"
          error={comments.error}
          onRetry={() => void comments.refetch()}
        />
      ) : !rows.length ? (
        <Panel className="text-tau-sm text-ink-3 py-12 text-center">没有匹配的评论。</Panel>
      ) : (
        <Panel pad="none" className="overflow-hidden">
          <table className="text-tau-meta w-full border-collapse">
            <thead>
              <tr className="text-tau-sm text-ink-3 border-line-1 border-b text-left">
                <th className="w-[46%] px-4 py-2.5 font-medium">评论</th>
                <th className="px-4 py-2.5 font-medium">插件</th>
                <th className="px-4 py-2.5 font-medium">匿名身份</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
                <th className="w-10" aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  className="border-line-1 hover:bg-surface-hover border-b align-top transition-colors last:border-b-0"
                >
                  <td className="px-4 py-3">
                    {row.deleted ? (
                      <span className="text-ink-3 inline-flex items-center gap-1.5">
                        <Ban size={13} />
                        正文已删除，无法恢复
                      </span>
                    ) : (
                      <p className="text-ink-1 line-clamp-2 whitespace-pre-wrap break-words">
                        {row.message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      title="只看这个插件"
                      onClick={() => setFilter({ ...filter, pluginId: row.pluginId })}
                      className="hover:text-accent-text flex max-w-[160px] items-center gap-1.5 text-left transition-colors"
                    >
                      <PluginMark pluginId={row.pluginId} name={nameOf(row.pluginId)} size="xs" />
                      <span className="truncate">{nameOf(row.pluginId)}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        title="只看这个身份"
                        onClick={() =>
                          setFilter({ pluginId: "", visitorId: row.visitorId, status: "all" })
                        }
                        className="bg-hover text-ink-2 hover:text-accent-text font-tau-mono text-tau-micro rounded px-1.5 py-px transition-colors"
                      >
                        {row.visitorId.slice(0, 10)}
                      </button>
                      {row.suspended && (
                        <Tag color="red" showDot={false}>
                          已停用
                        </Tag>
                      )}
                    </span>
                  </td>
                  <td className="text-ink-3 whitespace-nowrap px-4 py-3">
                    {formatTime(row.createdAt)}
                  </td>
                  <td className="px-2 py-2">
                    <Menu
                      align="end"
                      trigger={
                        <IconButton aria-label="更多操作">
                          <Ellipsis size={15} />
                        </IconButton>
                      }
                    >
                      {!row.deleted && (
                        <Menu.Item
                          danger
                          icon={<Trash2 />}
                          onSelect={() => choose(row, "delete_comment")}
                        >
                          删除评论
                        </Menu.Item>
                      )}
                      {row.suspended ? (
                        <Menu.Item
                          icon={<UserCheck />}
                          onSelect={() => choose(row, "restore_visitor")}
                        >
                          恢复匿名身份
                        </Menu.Item>
                      ) : (
                        <Menu.Item
                          danger
                          icon={<UserX />}
                          onSelect={() => choose(row, "suspend_visitor")}
                        >
                          停用匿名身份
                        </Menu.Item>
                      )}
                      <Menu.Separator />
                      <Menu.Item
                        icon={<VenetianMask />}
                        onSelect={() =>
                          setFilter({ pluginId: "", visitorId: row.visitorId, status: "all" })
                        }
                      >
                        只看该身份的评论
                      </Menu.Item>
                    </Menu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );

  const eventItems = events.data?.pages.flatMap(page => page.items) ?? [];
  const eventTable = events.isPending ? (
    <Loading minHeight={200} />
  ) : events.isError && !events.data ? (
    <ErrorState
      icon={CloudOff}
      title="操作记录读取失败"
      error={events.error}
      onRetry={() => void events.refetch()}
    />
  ) : !eventItems.length ? (
    <Panel className="text-tau-sm text-ink-3 py-12 text-center">暂无操作记录。</Panel>
  ) : (
    <Panel pad="none" className="overflow-hidden">
      <table className="text-tau-meta w-full border-collapse">
        <thead>
          <tr className="text-tau-sm text-ink-3 border-line-1 border-b text-left">
            <th className="px-4 py-2.5 font-medium">操作</th>
            <th className="px-4 py-2.5 font-medium">对象</th>
            <th className="w-[38%] px-4 py-2.5 font-medium">原因</th>
            <th className="px-4 py-2.5 font-medium">管理员</th>
            <th className="px-4 py-2.5 font-medium">时间</th>
          </tr>
        </thead>
        <tbody>
          {eventItems.map(event => (
            <tr key={event.id} className="border-line-1 border-b align-top last:border-b-0">
              <td className="px-4 py-3">
                <Tag color={event.action === "restore_visitor" ? "green" : "red"} showDot={false}>
                  {LABELS[event.action]}
                </Tag>
              </td>
              <td className="text-ink-2 font-tau-mono text-tau-micro break-all px-4 py-3">
                评论 {event.commentId.slice(0, 8)} · 身份 {event.visitorId.slice(0, 10)}
              </td>
              <td className="text-ink-1 whitespace-pre-wrap break-words px-4 py-3">
                {event.reason}
              </td>
              <td className="text-ink-2 px-4 py-3">{event.reviewer}</td>
              <td className="text-ink-3 whitespace-nowrap px-4 py-3">
                {formatTime(event.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        title="评论管理"
        meta="处置公开评论与匿名身份；每次操作都要写原因，并留在操作记录里。"
      />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "comments", label: "评论", children: commentTable },
          { key: "events", label: "操作记录", children: eventTable },
        ]}
      />
      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            加载更多
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={!!target}
        title={target ? LABELS[target.action] : "管理操作"}
        context={target ? nameOf(target.row.pluginId) : undefined}
        danger={target?.action !== "restore_visitor"}
        confirmText="确认处理"
        confirmDisabled={!reason.trim()}
        onOpenChange={open => {
          if (!open) setTarget(null);
        }}
        description={
          <div className="flex flex-col gap-3">
            {target && !target.row.deleted && (
              <p className="text-ink-2 border-line-1 bg-surface-hover line-clamp-3 whitespace-pre-wrap rounded-r-[8px] border-l-[3px] px-3 py-1.5">
                {target.row.message}
              </p>
            )}
            <p>{target ? EFFECTS[target.action] : null}</p>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map(text => (
                <button
                  key={text}
                  type="button"
                  onClick={() => setReason(text)}
                  className="bg-hover text-ink-2 hover:bg-press hover:text-ink-1 text-tau-micro rounded-full px-2.5 py-0.5 transition-colors"
                >
                  {text}
                </button>
              ))}
            </div>
            <Textarea
              aria-label="处理原因"
              placeholder="写进操作记录，作者与访客看不到"
              maxLength={1000}
              value={reason}
              disabled={action.isPending}
              onChange={event => setReason(event.target.value)}
            />
            {action.isError && (
              <div
                role="alert"
                className="text-tau-sm text-danger flex flex-wrap items-center gap-2"
              >
                {errorMessage(action.error)}
                <Button
                  size="sm"
                  variant="ghost"
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
          // 同参数重试复用请求 ID，服务端据此返回原操作而不重放
          const signature = JSON.stringify(input);
          if (pending.current?.signature !== signature)
            pending.current = { signature, id: crypto.randomUUID() };
          await action.mutateAsync({ ...input, clientRequestId: pending.current.id });
        }}
      />
    </div>
  );
}
