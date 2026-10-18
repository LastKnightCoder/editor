import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Button, Input, Panel, Select } from "@tau/ui";
import type { CatalogEntry, CatalogSort } from "../../../contracts";
import { useApi } from "../app/api";
import { savePluginZip } from "../api/download";

export function CatalogPage() {
  const api = useApi();
  const [q, setQuery] = useState("");
  const [sort, setSort] = useState<CatalogSort>("downloads7d");
  const catalog = useInfiniteQuery({
    queryKey: ["catalog", q, sort],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.getCatalog({ q, sort, cursor: pageParam }),
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const download = useMutation({
    mutationFn: (entry: CatalogEntry) =>
      savePluginZip(api, entry.latest.releaseId, `${entry.pluginId}-${entry.latest.version}.zip`),
  });
  const items = [
    ...new Map(
      catalog.data?.pages.flatMap(page => page.items).map(entry => [entry.pluginId, entry]) ?? []
    ).values(),
  ];
  return (
    <main className="mx-auto max-w-[1120px] px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-tau-title-lg font-semibold">插件中心</h1>
        <Link className="text-accent-text" to="/submissions">
          发布与审核
        </Link>
      </header>
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          aria-label="搜索插件"
          placeholder="搜索插件"
          value={q}
          onChange={event => setQuery(event.target.value)}
        />
        <Select
          aria-label="插件排序"
          value={sort}
          onValueChange={value => setSort(value as CatalogSort)}
          options={[
            { value: "downloads7d", label: "最近热门" },
            { value: "downloadsTotal", label: "下载最多" },
            { value: "updated", label: "最近更新" },
          ]}
        />
      </div>
      <p className="text-ink-3 text-tau-meta mb-4">
        仅统计插件中心提供的 ZIP，按匿名设备、版本和 UTC 日去重；近 7
        日含今日。数量从统计上线起累计，不代表安装人数。
      </p>
      {catalog.isPending && <p role="status">正在读取插件…</p>}
      {catalog.isError && (
        <div role="alert">
          {catalog.error.message}
          <Button onClick={() => void catalog.refetch()}>重试</Button>
        </div>
      )}
      {download.isError && <p role="alert">{download.error.message}</p>}
      {!catalog.isPending && !catalog.isError && !items.length && (
        <p>{catalog.hasNextPage ? "本页暂无匹配插件，请继续加载。" : "没有找到插件。"}</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map(entry => (
          <Panel key={entry.pluginId} className="flex flex-col gap-3 p-5">
            <h2 className="text-tau-title font-semibold">{entry.name}</h2>
            <p className="text-ink-2">{entry.description}</p>
            <p className="text-ink-3 text-tau-meta">
              @{entry.publisher.login} · v{entry.latest.version} · 最低 Tau{" "}
              {entry.latest.minAppVersion}
            </p>
            <p className="text-ink-3 text-tau-meta">
              累计 {entry.downloadsTotal.toLocaleString()} 次 · 近 7 日{" "}
              {entry.downloads7d.toLocaleString()} 次
            </p>
            <Button disabled={download.isPending} onClick={() => download.mutate(entry)}>
              下载 ZIP
            </Button>
          </Panel>
        ))}
      </div>
      {catalog.hasNextPage && (
        <Button
          className="mt-4"
          loading={catalog.isFetchingNextPage}
          onClick={() => void catalog.fetchNextPage()}
        >
          加载更多
        </Button>
      )}
    </main>
  );
}
