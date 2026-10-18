import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, VenetianMask } from "lucide-react";
import { Button, ConfirmDialog, IconButton, Loading, Textarea, Tooltip } from "@tau/ui";
import { useApi } from "../../app/api";
import { errorMessage } from "../../api/errors";
import { formatRelative } from "../../components/format";
import { communityKey, useCommunity } from "./useCommunity";

/** 插件评论：无需登录，以当前浏览器的匿名身份发表 */
export function PluginComments({ pluginId }: { pluginId: string }) {
  const api = useApi();
  const client = useQueryClient();
  const { query, first, comments } = useCommunity(pluginId);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pending = useRef<{ message: string; id: string } | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: communityKey(pluginId) });
  const comment = useMutation({
    mutationFn: () => {
      const text = message.trim();
      // 结果未知时原文重试复用请求 ID，改了正文才换新 ID
      if (pending.current?.message !== text)
        pending.current = { message: text, id: crypto.randomUUID() };
      return api.addComment(pluginId, text, pending.current.id);
    },
    onSuccess: async () => {
      setMessage("");
      pending.current = null;
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteComment(pluginId, id),
    onSuccess: refresh,
  });

  return (
    <section aria-label="插件评论" className="flex flex-col">
      <form
        className="border-line-1 bg-surface rounded-tau-md flex flex-col gap-2 border p-3"
        onSubmit={event => {
          event.preventDefault();
          if (!comment.isPending && message.trim()) comment.mutate();
        }}
      >
        <Textarea
          aria-label="评论内容"
          placeholder="分享使用体验，最多 2000 字"
          maxLength={2000}
          value={message}
          disabled={comment.isPending}
          onChange={event => setMessage(event.target.value)}
          className="min-h-[56px]"
        />
        <div className="flex items-center gap-2">
          <span className="text-tau-micro text-ink-3 inline-flex items-center gap-1.5">
            <VenetianMask size={13} />
            无需登录，以当前浏览器的匿名身份发表
          </span>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            className="ml-auto"
            loading={comment.isPending}
            disabled={!message.trim()}
          >
            发表评论
          </Button>
        </div>
      </form>
      {[comment.error, remove.error]
        .filter((error): error is Error => error !== null)
        .map((error, index) => (
          <p key={index} role="alert" className="text-tau-sm text-danger mt-2">
            {errorMessage(error)}
          </p>
        ))}
      {query.isPending && <Loading minHeight={120} label="正在读取评论…" />}
      {query.isError && !query.data && (
        <p role="alert" className="text-tau-sm text-danger mt-3 flex items-center gap-2">
          评论读取失败：{errorMessage(query.error)}
          <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
            重试
          </Button>
        </p>
      )}
      {first && !comments.length && (
        <p className="text-tau-sm text-ink-3 py-8 text-center">暂无评论。</p>
      )}
      <ul className="divide-line-1 mt-2 flex flex-col divide-y">
        {comments.map(row => (
          <li key={row.id} className="flex gap-2.5 py-3.5">
            <span
              className={
                row.canDelete
                  ? "bg-accent-soft text-accent-text text-tau-tiny grid size-5 shrink-0 place-items-center rounded-full font-semibold"
                  : "bg-hover text-ink-3 text-tau-tiny grid size-5 shrink-0 place-items-center rounded-full"
              }
            >
              {row.canDelete ? "我" : "匿"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-tau-micro text-ink-3">
                {row.canDelete ? "我" : "匿名用户"} · {formatRelative(row.createdAt)}
              </p>
              <p className="text-tau-body text-ink-1 mt-0.5 whitespace-pre-wrap break-words">
                {row.message}
              </p>
            </div>
            {row.canDelete && (
              <Tooltip content="删除我的评论">
                <IconButton
                  aria-label="删除我的评论"
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
      {query.hasNextPage && (
        <Button
          variant="ghost"
          className="self-center"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          加载更多评论
        </Button>
      )}
      <p className="text-tau-micro text-ink-3 mt-3">
        清除浏览器数据后，无法再删除原来的评论或取消喜欢。
      </p>
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
