import { useRef, useState } from "react";
import { Button, ConfirmDialog, Textarea } from "@tau/ui";
import { usePluginCommunity } from "../queries";

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
      {rows.map(row => (
        <article key={row.id} className="flex flex-col gap-2 py-2">
          <p className="text-tau-meta text-ink-3">
            {row.canDelete ? "我" : "匿名用户"} · {new Date(row.createdAt).toLocaleString()}
          </p>
          <p className="whitespace-pre-wrap break-words">{row.message}</p>
          {row.canDelete && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                onClick={() => setDeletingId(row.id)}
              >
                删除我的评论
              </Button>
            </div>
          )}
        </article>
      ))}
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
