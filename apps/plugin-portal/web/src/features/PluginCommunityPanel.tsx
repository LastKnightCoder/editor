import { useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDialog, Textarea } from "@tau/ui";
import { useApi } from "../app/api";

export function PluginCommunityPanel({ pluginId }: { pluginId: string }) {
  const api = useApi();
  const client = useQueryClient();
  const key = ["plugin-community", pluginId];
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pendingComment = useRef<{ message: string; id: string } | null>(null);
  const community = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.getCommunity(pluginId, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const like = useMutation({
    mutationFn: (liked: boolean) => api.setPluginLiked(pluginId, liked),
    onSuccess: refresh,
  });
  const comment = useMutation({
    mutationFn: () => {
      const text = message.trim();
      if (pendingComment.current?.message !== text)
        pendingComment.current = { message: text, id: crypto.randomUUID() };
      return api.addComment(pluginId, text, pendingComment.current.id);
    },
    onSuccess: async () => {
      setMessage("");
      pendingComment.current = null;
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteComment(pluginId, id),
    onSuccess: refresh,
  });
  const first = community.data?.pages[0];
  const rows = [
    ...new Map(
      community.data?.pages.flatMap(page => page.comments).map(row => [row.id, row]) ?? []
    ).values(),
  ];
  return (
    <section
      aria-label="插件评论与喜欢"
      className="border-line-1 flex flex-col gap-3 border-t pt-3"
    >
      <p className="text-tau-meta text-ink-3">
        无需登录，使用当前浏览器的匿名身份。清除浏览器数据后，无法再删除原评论或取消原来的喜欢。
      </p>
      {community.isPending && <p role="status">正在读取评论…</p>}
      {community.isError && (
        <div role="alert">
          {community.error.message}
          <Button onClick={() => void community.refetch()}>重试</Button>
        </div>
      )}
      {first && (
        <Button
          aria-pressed={first.liked}
          disabled={like.isPending}
          onClick={() => like.mutate(!first.liked)}
        >
          {first.liked ? "取消喜欢" : "喜欢"} · {first.likes}
        </Button>
      )}
      {[like.error, comment.error, remove.error]
        .filter((error): error is Error => error !== null)
        .map((error, index) => (
          <p key={index} role="alert">
            {error.message}
          </p>
        ))}
      <form
        className="flex flex-col gap-2"
        onSubmit={event => {
          event.preventDefault();
          if (!comment.isPending && message.trim()) comment.mutate();
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
        <Button type="submit" disabled={comment.isPending || !message.trim()}>
          发表评论
        </Button>
      </form>
      {first && !rows.length && <p className="text-ink-3">暂无评论。</p>}
      {rows.map(row => (
        <article key={row.id} className="border-line-1 flex flex-col gap-2 border-t pt-3">
          <p className="text-tau-meta text-ink-3">
            {row.canDelete ? "我" : "匿名用户"} · {new Date(row.createdAt).toLocaleString()}
          </p>
          <p className="whitespace-pre-wrap break-words">{row.message}</p>
          {row.canDelete && (
            <Button disabled={remove.isPending} onClick={() => setDeletingId(row.id)}>
              删除我的评论
            </Button>
          )}
        </article>
      ))}
      {community.hasNextPage && (
        <Button
          disabled={community.isFetchingNextPage}
          onClick={() => void community.fetchNextPage()}
        >
          加载更多评论
        </Button>
      )}
      <ConfirmDialog
        open={!!deletingId}
        title="删除评论"
        description="删除后无法恢复。"
        confirmText="确认删除"
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
