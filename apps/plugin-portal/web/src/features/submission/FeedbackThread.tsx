import { useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { Button, Panel, Textarea, cn } from "@tau/ui";
import { queryKeys, useApi } from "../../app/api";
import { errorMessage } from "../../api/errors";
import { formatRelative } from "../../components/format";

const feedbackKey = (submissionId: string) => ["feedback", submissionId] as const;

/** 作者与审核者的站内沟通，按时间正序 */
export function FeedbackThread({
  submissionId,
  placeholder,
  id,
}: {
  submissionId: string;
  placeholder: string;
  id?: string;
}) {
  const api = useApi();
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const query = useInfiniteQuery({
    queryKey: feedbackKey(submissionId),
    queryFn: ({ pageParam }) => api.listFeedback(submissionId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    refetchOnWindowFocus: true,
  });
  const send = useMutation({
    mutationFn: () => api.sendFeedback(submissionId, message, requestId.current),
    onSuccess: () => {
      setMessage("");
      requestId.current = crypto.randomUUID();
      void client.invalidateQueries({ queryKey: feedbackKey(submissionId) });
      void client.invalidateQueries({ queryKey: queryKeys.submissions });
    },
  });
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return (
    <section id={id} aria-label="站内沟通" className="scroll-mt-20">
      <h2 className="text-tau-sm text-ink-3 mb-2 flex items-center gap-1.5 font-medium">
        <MessagesSquare size={14} />
        沟通
        <span className="font-normal">· 仅作者与审核者可见</span>
      </h2>
      <Panel pad="none" className="px-4 pb-3.5 pt-1">
        {query.isError && (
          <p role="alert" className="text-tau-sm text-danger flex items-center gap-2 py-3">
            {errorMessage(query.error)}
            <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
              重试
            </Button>
          </p>
        )}
        {query.data && !items.length && (
          <p className="text-tau-sm text-ink-3 py-4">还没有消息。有问题可以直接在这里说。</p>
        )}
        <ul className="divide-line-1 flex flex-col divide-y">
          {items.map(item => (
            <li key={item.id} className="flex gap-2.5 py-3">
              <span
                className={cn(
                  "text-tau-tiny grid size-5 shrink-0 place-items-center rounded-full font-semibold",
                  item.role === "reviewer"
                    ? "bg-info-soft text-info"
                    : "bg-accent-soft text-accent-text"
                )}
              >
                {item.author.login.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-tau-micro text-ink-3 flex items-center gap-1.5">
                  {item.author.login}
                  <span
                    className={cn(
                      "rounded px-1.5",
                      item.role === "reviewer" ? "bg-info-soft text-info" : "bg-hover text-ink-2"
                    )}
                  >
                    {item.role === "reviewer" ? "审核者" : "作者"}
                  </span>
                  · {formatRelative(item.createdAt)}
                </p>
                <p className="text-tau-body text-ink-1 mt-0.5 whitespace-pre-wrap break-words">
                  {item.message}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {query.hasNextPage && (
          <Button size="sm" variant="ghost" onClick={() => void query.fetchNextPage()}>
            加载更多
          </Button>
        )}
        <div className="mt-2 flex items-end gap-2">
          <Textarea
            aria-label="反馈内容"
            maxLength={4000}
            value={message}
            disabled={send.isPending}
            onChange={event => {
              setMessage(event.target.value);
              requestId.current = crypto.randomUUID();
            }}
            placeholder={placeholder}
            className="min-h-[40px]"
          />
          <Button disabled={!message.trim()} loading={send.isPending} onClick={() => send.mutate()}>
            发送
          </Button>
        </div>
        {send.isError && (
          <p role="alert" className="text-tau-sm text-danger mt-2">
            {errorMessage(send.error)}
          </p>
        )}
      </Panel>
    </section>
  );
}
