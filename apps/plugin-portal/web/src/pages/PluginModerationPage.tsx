import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  CloudOff,
  Ellipsis,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
  IconButton,
  Input,
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
  ManagedPlugin,
  ManagedPluginFilter,
  PluginModerationAction,
  PluginModerationInput,
} from "../../../contracts";
import { useApi } from "../app/api";
import { useSession } from "../app/session";
import { errorMessage } from "../api/errors";
import { PageHeader } from "../components/PageHeader";
import { PluginMark } from "../components/PluginMark";
import { formatRelative, formatTime } from "../components/format";
import { ErrorState } from "../components/states";
import { useDebouncedValue } from "../components/useDebouncedValue";

const LABELS: Record<PluginModerationAction, string> = {
  disable_plugin: "禁用插件",
  enable_plugin: "恢复上架",
};

const EFFECTS: Record<PluginModerationAction, string> = {
  disable_plugin:
    "禁用后插件立即从插件中心与搜索结果消失，所有版本不可下载；已安装用户不受影响。作者能看到这条原因，仍可提交整改版本并进入审核。",
  enable_plugin: "恢复后已发布的全部版本立即重新上架，包括禁用期间批准的版本。",
};

const REASONS: Record<PluginModerationAction, string[]> = {
  disable_plugin: [
    "包含恶意代码或隐私风险",
    "README 含广告或违规外链",
    "侵权或冒用他人作品",
    "严重缺陷导致客户端崩溃",
  ],
  enable_plugin: ["作者已整改并通过审核", "误判，撤销禁用"],
};

const STATUS_LABELS: Record<ManagedPluginFilter["status"], string> = {
  all: "全部插件",
  active: "正常上架",
  disabled: "已禁用",
};

type Tab = "plugins" | "events";

export function PluginModerationPage() {
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
        只有管理员可以管理插件。
      </p>
    );
  return <PluginModerationContent />;
}

function PluginModerationContent() {
  const api = useApi();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>("plugins");
  const [input, setInput] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(input.trim(), 250);
  const [status, setStatus] = useState<ManagedPluginFilter["status"]>("all");
  const filter: ManagedPluginFilter = { q, status };
  const [target, setTarget] = useState<{
    row: ManagedPlugin;
    action: PluginModerationAction;
  } | null>(null);
  const [reason, setReason] = useState("");
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const plugins = useInfiniteQuery({
    queryKey: ["plugin-moderation", "plugins", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.listManagedPlugins(filter, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    enabled: tab === "plugins",
  });
  const events = useInfiniteQuery({
    queryKey: ["plugin-moderation", "events"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.listPluginModerationEvents(pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    enabled: tab === "events",
  });
  // 禁用/恢复会改变公开目录、版本/统计可见性与作者侧的禁用标记，一并失效
  const refresh = () =>
    Promise.all(
      [
        "plugin-moderation",
        "catalog",
        "plugin-releases",
        "release",
        "plugin-stats",
        "submissions",
      ].map(key => client.invalidateQueries({ queryKey: [key] }))
    );
  const action = useMutation({
    mutationFn: (input: PluginModerationInput) => api.moderatePlugin(input),
    onSuccess: async () => {
      setTarget(null);
      await refresh();
    },
  });
  const choose = (row: ManagedPlugin, choice: PluginModerationAction) => {
    action.reset();
    pending.current = null;
    setReason("");
    setTarget({ row, action: choice });
  };
  const rows = [
    ...new Map(
      plugins.data?.pages.flatMap(page => page.items).map(row => [row.pluginId, row]) ?? []
    ).values(),
  ];
  const query = tab === "plugins" ? plugins : events;

  const filters = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input
        lead={Search}
        clearable
        aria-label="搜索插件"
        placeholder="按插件 ID 或名称搜索，含已禁用"
        value={input}
        onChange={event => setInput(event.target.value)}
        wrapperClassName="h-9 w-[320px]"
      />
      <Menu
        trigger={
          <Button size="sm" icon={Filter}>
            {STATUS_LABELS[status]}
            <ChevronDown size={13} className="text-ink-3" />
          </Button>
        }
      >
        <Menu.RadioGroup
          value={status}
          onValueChange={value => setStatus(value as ManagedPluginFilter["status"])}
        >
          {(Object.keys(STATUS_LABELS) as ManagedPluginFilter["status"][]).map(value => (
            <Menu.RadioItem key={value} value={value}>
              {STATUS_LABELS[value]}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu>
      <Tooltip content="刷新">
        <IconButton aria-label="刷新" className="ml-auto" onClick={() => void query.refetch()}>
          <RefreshCw size={14} className={cn(query.isFetching && "animate-spin")} />
        </IconButton>
      </Tooltip>
    </div>
  );

  const pluginTable = (
    <>
      {filters}
      {plugins.isPending ? (
        <Loading minHeight={200} />
      ) : plugins.isError && !plugins.data ? (
        <ErrorState
          icon={CloudOff}
          title="插件列表读取失败"
          error={plugins.error}
          onRetry={() => void plugins.refetch()}
        />
      ) : !rows.length ? (
        <Panel className="text-tau-sm text-ink-3 py-12 text-center">
          {q ? `没有找到「${q}」相关的插件。` : "还没有登记的插件。"}
        </Panel>
      ) : (
        <Panel pad="none" className="overflow-hidden">
          <table className="text-tau-meta w-full border-collapse">
            <thead>
              <tr className="text-tau-sm text-ink-3 border-line-1 border-b text-left">
                <th className="w-[34%] px-4 py-2.5 font-medium">插件</th>
                <th className="px-4 py-2.5 font-medium">作者</th>
                <th className="px-4 py-2.5 font-medium">版本</th>
                <th className="px-4 py-2.5 font-medium">下载</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="w-10" aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.pluginId}
                  className="border-line-1 hover:bg-surface-hover border-b align-top transition-colors last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <PluginMark
                        pluginId={row.pluginId}
                        name={row.name ?? row.pluginId}
                        size="xs"
                      />
                      <div className="min-w-0">
                        <p className="text-ink-1 truncate font-medium">
                          {row.name ?? row.pluginId}
                        </p>
                        <p className="text-tau-micro text-ink-3 font-tau-mono truncate">
                          {row.pluginId}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-ink-2 px-4 py-3">{row.publisher.login}</td>
                  <td className="px-4 py-3">
                    {row.latestVersion ? (
                      <>
                        <p className="text-ink-1 font-tau-mono">v{row.latestVersion}</p>
                        <p className="text-tau-micro text-ink-3">
                          {row.releaseCount} 个版本 · {formatRelative(row.latestPublishedAt)}
                        </p>
                      </>
                    ) : (
                      <span className="text-ink-3">未发布</span>
                    )}
                  </td>
                  <td className="text-ink-2 font-tau-mono px-4 py-3">{row.downloadsTotal}</td>
                  <td className="px-4 py-3">
                    {row.disabled ? (
                      <Tooltip content={`${row.disabled.reason} · ${formatTime(row.disabled.at)}`}>
                        <Tag color="red" showDot={false}>
                          已禁用
                        </Tag>
                      </Tooltip>
                    ) : (
                      <Tag color="green" showDot={false}>
                        上架中
                      </Tag>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Menu
                      align="end"
                      trigger={
                        <IconButton aria-label={`${row.name ?? row.pluginId}的操作`}>
                          <Ellipsis size={15} />
                        </IconButton>
                      }
                    >
                      {row.disabled ? (
                        <Menu.Item
                          icon={<ShieldCheck />}
                          onSelect={() => choose(row, "enable_plugin")}
                        >
                          恢复上架
                        </Menu.Item>
                      ) : (
                        <Menu.Item
                          danger
                          icon={<ShieldOff />}
                          onSelect={() => choose(row, "disable_plugin")}
                        >
                          禁用插件
                        </Menu.Item>
                      )}
                      {!row.disabled && row.latestVersion && (
                        <>
                          <Menu.Separator />
                          <Menu.Item
                            icon={<ExternalLink />}
                            onSelect={() =>
                              navigate(`/plugins/${encodeURIComponent(row.pluginId)}`)
                            }
                          >
                            在插件中心查看
                          </Menu.Item>
                        </>
                      )}
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
            <th className="px-4 py-2.5 font-medium">插件</th>
            <th className="w-[38%] px-4 py-2.5 font-medium">原因</th>
            <th className="px-4 py-2.5 font-medium">管理员</th>
            <th className="px-4 py-2.5 font-medium">时间</th>
          </tr>
        </thead>
        <tbody>
          {eventItems.map(event => (
            <tr key={event.id} className="border-line-1 border-b align-top last:border-b-0">
              <td className="px-4 py-3">
                <Tag color={event.action === "enable_plugin" ? "green" : "red"} showDot={false}>
                  {LABELS[event.action]}
                </Tag>
              </td>
              <td className="text-ink-2 font-tau-mono text-tau-micro break-all px-4 py-3">
                <button
                  type="button"
                  title="在列表中搜索"
                  onClick={() => {
                    setInput(event.pluginId);
                    setTab("plugins");
                  }}
                  className="hover:text-accent-text text-left transition-colors"
                >
                  {event.pluginId}
                </button>
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
        title="插件管理"
        meta="禁用会把整个插件从插件中心与搜索中撤下；原因对作者可见，便于整改后恢复。"
      />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "plugins", label: "插件", children: pluginTable },
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
        title={target ? LABELS[target.action] : "插件操作"}
        context={target ? (target.row.name ?? target.row.pluginId) : undefined}
        danger={target?.action === "disable_plugin"}
        confirmText="确认处理"
        confirmDisabled={!reason.trim()}
        onOpenChange={open => {
          if (!open) setTarget(null);
        }}
        description={
          <div className="flex flex-col gap-3">
            <p>{target ? EFFECTS[target.action] : null}</p>
            <div className="flex flex-wrap gap-1.5">
              {(target ? REASONS[target.action] : []).map(text => (
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
              placeholder={
                target?.action === "disable_plugin"
                  ? "作者会看到这段话，请写清需要整改什么"
                  : "写进操作记录"
              }
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
            pluginId: target.row.pluginId,
            action: target.action,
            reason: reason.trim(),
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
