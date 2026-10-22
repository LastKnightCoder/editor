import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, ConfirmDialog, IconButton, Textarea, Tooltip, cn } from "@tau/ui";
import { usePluginCommunity } from "../queries";

const commentTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function PluginCommunityTab({ pluginId }: { pluginId: string }) {
  const { query, like, comment, remove } = usePluginCommunity(pluginId);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pending = useRef<{ message: string; requestId: string } | null>(null);
  const first = query.data?.pages[0];
  const rows = [
    ...new Map(
      query.data?.pages.flatMap(page => page.comments).map(row => [row.id, row]) ?? []
    ).values(),
  ];
  const submit = () => {
    const text = message.trim();
    if (!text || comment.isPending) return;
    if (pending.current?.message !== text)
      pending.current = { message: text, requestId: crypto.randomUUID() };
    comment.mutate(pending.current, {
      onSuccess: () => {
        setMessage("");
        pending.current = null;
      },
    });
  };
  return (
    <section aria-label="插件评论与喜欢" className="flex flex-col gap-4">
      <p className="text-tau-meta text-ink-3">
        无需登录，使用本机安装的匿名身份，与浏览器身份分开。清除应用数据后，将无法删除原评论或取消原来的喜欢。
      </p>
      {query.isPending && <p role="status">正在读取评论…</p>}
      {query.isError && (
        <div role="alert">
          {query.error.message}
          <Button onClick={() => void query.refetch()}>重试</Button>
        </div>
      )}
      {first && (
        <div>
          <Button
            aria-pressed={first.liked}
            variant={first.liked ? "soft" : "secondary"}
            loading={like.isPending}
            onClick={() => like.mutate(!first.liked)}
          >
            {first.liked ? "取消喜欢" : "喜欢"} · {first.likes}
          </Button>
        </div>
      )}
      {[like.error, comment.error, remove.error]
        .filter((error): error is Error => error !== null)
        .map((error, index) => (
          <p key={index} role="alert" className="text-danger text-tau-meta">
            {error.message}
          </p>
        ))}
      <form
        className="flex flex-col gap-3"
        onSubmit={event => {
          event.preventDefault();
          submit();
        }}
      >
        <Textarea
          aria-label="评论内容"
          placeholder="分享使用体验（最多2000字）"
          maxLength={2000}
          value={message}
          disabled={comment.isPending}
          onChange={event => setMessage(event.target.value)}
        />
        <div>
          <Button type="submit" disabled={!message.trim()} loading={comment.isPending}>
            发表评论
          </Button>
        </div>
      </form>
      {first && !rows.length && <p className="text-ink-3">暂无评论。</p>}
      {rows.length > 0 && (
        <ul aria-label="评论列表" className="divide-line-1 flex flex-col divide-y">
          {rows.map(row => (
            <li key={row.id} className="group flex gap-3 py-3.5">
              <span
                aria-hidden
                className={cn(
                  "text-tau-tiny grid size-7 shrink-0 place-items-center rounded-full",
                  row.canDelete
                    ? "bg-accent-soft text-accent-text font-semibold"
                    : "bg-hover text-ink-3"
                )}
              >
                {row.canDelete ? "我" : "匿"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-tau-meta text-ink-3">
                  <span className="text-ink-2 font-medium">
                    {row.canDelete ? "我" : "匿名用户"}
                  </span>
                  <span className="mx-1.5">·</span>
                  <time dateTime={row.createdAt}>
                    {commentTimeFormat.format(new Date(row.createdAt))}
                  </time>
                </p>
                <p className="text-tau-body text-ink-1 mt-1 whitespace-pre-wrap break-words">
                  {row.message}
                </p>
              </div>
              {row.canDelete && (
                <Tooltip content="删除我的评论">
                  <IconButton
                    aria-label="删除我的评论"
                    className="hover:text-danger size-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                    disabled={remove.isPending}
                    onClick={() => setDeletingId(row.id)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          加载更多评论
        </Button>
      )}
      <ConfirmDialog
        open={!!deletingId}
        title="删除评论"
        description="删除后无法恢复。"
        confirmText="确认删除"
        danger
        onOpenChange={open => {
          if (!open) setDeletingId(null);
        }}
        onConfirm={async () => {
          if (deletingId) await remove.mutateAsync(deletingId);
        }}
      />
    </section>
  );
}
