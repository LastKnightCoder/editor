import { useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { PluginPageProps } from "@tau/plugins";
import { Button, Panel } from "@tau/ui";
import { loadNotebookPage } from "./client";

type Props = PluginPageProps & { getApiKey(): string };
export function WeReadNotebooks(props: Props) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false } },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <NotebookContent {...props} />
    </QueryClientProvider>
  );
}

function NotebookContent({ context, getApiKey }: Props) {
  const client = useQueryClient();
  const [started, setStarted] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const connection = useQuery({
    queryKey: ["connection"],
    queryFn: async () => Boolean(getApiKey()),
  });
  const configured = connection.data === true;
  const query = useInfiniteQuery({
    queryKey: ["notebooks"],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam, signal }) => loadNotebookPage(context, getApiKey, pageParam, signal),
    getNextPageParam: page => page.next ?? undefined,
    enabled: started && configured,
    refetchOnMount: false,
  });
  useEffect(
    () => () => {
      void client.cancelQueries();
    },
    [client]
  );
  const refresh = async () => {
    setCancelled(false);
    if (!started) setStarted(true);
    else await client.resetQueries({ queryKey: ["notebooks"], exact: true });
  };
  const cancel = async () => {
    await client.cancelQueries({ queryKey: ["notebooks"], exact: true });
    setCancelled(true);
  };
  const books = [
    ...new Map(
      (query.data?.pages.flatMap(page => page.books) ?? []).map(book => [book.id, book])
    ).values(),
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-tau-title text-ink-1">微信读书笔记书单</h1>
      <p className="text-tau-body text-ink-2">
        读取账号中有笔记的书籍。本页按需加载，不修改本地书架或笔记。
      </p>
      {!configured && !connection.isPending && (
        <Panel>
          <p className="text-tau-body text-ink-2">
            请先在应用设置「账号与连接」配置微信读书 API Key，然后重新读取连接配置。
          </p>
          <Button onClick={() => void connection.refetch()}>重新读取连接配置</Button>
        </Panel>
      )}
      <div className="flex gap-2">
        <Button disabled={!configured || query.isFetching} onClick={() => void refresh()}>
          {started ? "重新读取书单" : "读取笔记书单"}
        </Button>
        {query.isFetching && (
          <Button variant="secondary" onClick={() => void cancel()}>
            取消读取
          </Button>
        )}
      </div>
      {(connection.error || query.error) && (
        <p role="alert" className="text-tau-body text-danger">
          {connection.error?.message || query.error?.message}
        </p>
      )}
      <p role="status" className="text-tau-meta text-ink-2">
        {connection.isPending
          ? "正在读取连接配置…"
          : query.isFetching
            ? "正在读取…"
            : cancelled
              ? "已取消读取"
              : query.data
                ? `已读取 ${books.length} 本`
                : "等待手动读取"}
      </p>
      {query.data && books.length === 0 && <Panel>当前账号没有笔记书籍。</Panel>}
      {books.map(book => (
        <Panel key={book.id}>
          <h2 className="text-tau-body text-ink-1 font-semibold">{book.title}</h2>
          <p className="text-tau-meta text-ink-2">
            {book.author} · {book.notes} 条笔记
          </p>
        </Panel>
      ))}
      {query.hasNextPage && (
        <Button
          disabled={query.isFetching}
          onClick={() => {
            setCancelled(false);
            void query.fetchNextPage();
          }}
        >
          加载更多
        </Button>
      )}
    </div>
  );
}
