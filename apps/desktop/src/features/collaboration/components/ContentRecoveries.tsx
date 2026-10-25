import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Dialog, DialogBody } from "@tau/ui";
import { collaborationCommands } from "@/commands/contracts/collaboration";
import { withModule } from "@/commands/module-init";

const reasons: Record<string, string> = {
  migration: "正文转换前的副本",
  "library-replacement": "资料库替换前的副本",
  "private-block": "旧私有内容",
  "offline-edit": "本机编辑副本",
};

export function ContentRecoveries() {
  const [open, setOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [exported, setExported] = useState<string>();
  const query = useInfiniteQuery({
    queryKey: ["collaboration", "recoveries"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      withModule("collaboration", () => collaborationCommands.recoveries.call(pageParam)),
    getNextPageParam: (last, pages) => (last.length === 30 ? pages.length * 30 : undefined),
    enabled: open,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!open || !sentinel.current || !query.hasNextPage) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !query.isFetchingNextPage)
        void query.fetchNextPage();
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [open, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);
  const items = query.data?.pages.flat() ?? [];
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await query.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作未完成");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        本机恢复副本
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="本机恢复副本">
        <DialogBody>
          <p className="text-ink-2 text-tau-sm mb-3">
            副本独立保留原始正文、输入草稿和可取得的附件。导出前会校验文件；使用下载后的正文不会删除这些副本。
          </p>
          {(error || query.error) && (
            <p role="alert" className="text-danger">
              {error ?? String(query.error)}
            </p>
          )}
          {exported && (
            <p role="status" className="text-ink-2 text-tau-sm break-all">
              已导出到下载目录：{exported}
            </p>
          )}
          {query.isPending ? (
            <p>正在读取…</p>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-auto">
              {items.length === 0 && <p className="text-ink-2">暂无恢复副本</p>}
              {items.map(item => (
                <div key={item.id} className="border-line-1 rounded-tau-md border p-3">
                  <p className="text-ink-1">
                    {item.workspaceId} · {reasons[item.reason] ?? "无法读取的副本"}
                  </p>
                  <p className="text-ink-3 text-tau-xs break-all">{item.id}</p>
                  {item.error && (
                    <p role="alert" className="text-danger">
                      {item.error}
                    </p>
                  )}
                  {item.missing.length > 0 && (
                    <details className="text-ink-2 text-tau-sm">
                      <summary>{item.missing.length} 个资源未取得</summary>
                      {item.missing.map((value, index) => (
                        <p key={index} className="break-all">
                          {value}
                        </p>
                      ))}
                    </details>
                  )}
                  <Button
                    disabled={busy || Boolean(item.error)}
                    variant="secondary"
                    onClick={() =>
                      void run(async () => {
                        const path = await collaborationCommands.exportRecovery.call(item.id);
                        if (path) setExported(path);
                      })
                    }
                  >
                    导出到下载目录
                  </Button>
                  {item.documents.map(document => (
                    <div key={document.id} className="mt-2">
                      <p className="text-ink-2 text-tau-sm">
                        {document.title || "未命名正文"}
                        ：原编辑仍在此副本中，确认后解除旧会话与资料库的关联。
                      </p>
                      <Button
                        disabled={busy}
                        variant="secondary"
                        onClick={() =>
                          void run(() => collaborationCommands.useReplacedContent.call(document.id))
                        }
                      >
                        使用下载后的正文
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={sentinel} aria-hidden="true" className="h-1" />
              {query.isFetchingNextPage && <p className="text-ink-2">正在读取更多副本…</p>}
            </div>
          )}
        </DialogBody>
      </Dialog>
    </>
  );
}
