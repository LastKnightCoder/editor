import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isPluginCategory } from "@tau/plugins/package";
import { CloudOff, Search, SearchX } from "lucide-react";
import { Button, Input, Loading, isEditableTarget } from "@tau/ui";
import type { CatalogSort, CenterCatalogEntry, PluginCategory } from "../../../contracts";
import { errorMessage } from "../api/errors";
import { ErrorState, StateBlock } from "../components/states";
import { useDebouncedValue } from "../components/useDebouncedValue";
import { CategoryBar } from "../features/catalog/CategoryBar";
import { visibleCategories } from "../features/catalog/categories";
import { PluginCard } from "../features/catalog/PluginCard";
import { SortMenu } from "../features/catalog/SortMenu";
import { StatsHint } from "../features/catalog/StatsHint";
import { useCenterCatalog } from "../features/catalog/center-queries";
import { PlatformFilter } from "../features/catalog/PlatformFilter";
import {
  PLATFORM_LABELS,
  PORTABLE_PLATFORMS,
  type PlatformFilterValue,
} from "../features/catalog/platforms";
import { useZipSave } from "../features/catalog/useZipSave";

/** 翻页时榜单可能变化，按 pluginId 去重 */
function uniqueEntries(pages: { items: CenterCatalogEntry[] }[] | undefined) {
  return [
    ...new Map(pages?.flatMap(page => page.items).map(entry => [entry.pluginId, entry])).values(),
  ];
}

function readPlatform(value: string | null): PlatformFilterValue {
  return PORTABLE_PLATFORMS.find(platform => platform === value) ?? "all";
}

/** 「/」聚焦搜索框，编辑上下文里不抢键 */
function useSlashFocus(target: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.isComposing || isEditableTarget(event.target)) return;
      event.preventDefault();
      target.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target]);
}

export function CatalogPage() {
  const [input, setInput] = useState("");
  const q = useDebouncedValue(input.trim(), 250);
  const [sort, setSort] = useState<CatalogSort>("downloads7d");
  const [params, setParams] = useSearchParams();
  const raw = params.get("category");
  const category: PluginCategory | null = isPluginCategory(raw) ? raw : null;
  const platform = readPlatform(params.get("platform"));
  const setParam = (name: "category" | "platform", next: string | null) =>
    setParams(
      current => {
        const value = new URLSearchParams(current);
        if (next) value.set(name, next);
        else value.delete(name);
        return value;
      },
      { replace: true }
    );
  const setCategory = (next: PluginCategory | null) => setParam("category", next);
  const setPlatform = (next: PlatformFilterValue) =>
    setParam("platform", next === "all" ? null : next);
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef);
  // 网页没有真实宿主，不带 host 查询，兼容结论恒为 unchecked。
  const catalog = useCenterCatalog({ platform, q, category, sort });
  // 计数不受分类影响，切换分类时沿用上一次首页的计数，避免分类条闪烁
  const [counts, setCounts] = useState<Partial<Record<PluginCategory, number>> | null>(null);
  const firstCounts = catalog.data?.pages[0]?.categoryCounts;
  useEffect(() => {
    if (firstCounts) setCounts(firstCounts);
  }, [firstCounts]);
  // 平台计数同理：切换平台时沿用上一次首页的计数
  const [platformCounts, setPlatformCounts] = useState<Partial<
    Record<PlatformFilterValue, number>
  > | null>(null);
  const firstPlatformCounts = catalog.data?.pages[0]?.platformCounts;
  useEffect(() => {
    if (firstPlatformCounts) setPlatformCounts(firstPlatformCounts);
  }, [firstPlatformCounts]);
  const categoryName = visibleCategories(counts).find(item => item.id === category)?.label;
  const download = useZipSave();
  const platformName = platform === "all" ? null : PLATFORM_LABELS[platform];
  const filtered = !!(q || category || platformName);
  const items = uniqueEntries(catalog.data?.pages);

  let body;
  if (catalog.isPending) body = <Loading minHeight={320} label="正在读取插件…" />;
  else if (catalog.isError && !catalog.data)
    body = (
      <ErrorState
        icon={CloudOff}
        title="插件列表暂时打不开"
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
        retrying={catalog.isRefetching}
      />
    );
  else if (!items.length && !catalog.hasNextPage)
    body = (
      <StateBlock
        icon={SearchX}
        title={
          q
            ? `没有找到「${q}」相关的插件`
            : category
              ? `「${categoryName ?? category}」分类下暂无插件`
              : platformName
                ? `暂无支持${platformName}的插件`
                : "还没有上架的插件"
        }
        actions={
          filtered && (
            <Button
              onClick={() => {
                setInput("");
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              清除筛选
            </Button>
          )
        }
      >
        {filtered
          ? "换个关键词、分类或平台试试，比如插件的用途。"
          : "第一个通过审核的插件会出现在这里。"}
      </StateBlock>
    );
  else
    body = (
      <>
        {!items.length && (
          <p className="text-tau-sm text-ink-3 mb-4">本页暂无匹配插件，请继续加载。</p>
        )}
        <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(entry => (
            <li key={entry.pluginId} className="flex">
              <PluginCard
                entry={entry}
                platform={platform}
                downloading={download.pending}
                onDownload={value => download.save(value.pluginId, value.latest)}
              />
            </li>
          ))}
        </ul>
        {catalog.isFetchNextPageError && (
          <p role="alert" className="text-tau-sm text-danger mt-4 text-center">
            加载更多失败：{errorMessage(catalog.error)}
          </p>
        )}
        {catalog.hasNextPage && (
          <div className="mt-6 flex justify-center">
            <Button
              loading={catalog.isFetchingNextPage}
              onClick={() => void catalog.fetchNextPage()}
            >
              加载更多
            </Button>
          </div>
        )}
      </>
    );

  return (
    <main className="mx-auto max-w-[1120px] px-4 pt-6 pb-20 sm:px-8 sm:pt-8">
      <header className="mb-5">
        <h1 className="text-tau-hero text-ink-1 font-semibold tracking-[-0.01em]">插件中心</h1>
        <p className="text-tau-meta text-ink-3 mt-1">全部开源，在 Tau 应用的插件中心安装</p>
      </header>
      <div className="mb-5 flex items-center gap-3">
        <Input
          ref={searchRef}
          lead={Search}
          clearable
          aria-label="搜索插件"
          placeholder="搜索插件名称、ID 或用途（按 / 聚焦）"
          value={input}
          onChange={event => setInput(event.target.value)}
          wrapperClassName="h-[42px] min-w-0 flex-1 rounded-tau-md px-3.5"
        />
        <SortMenu value={sort} onChange={setSort} />
        <StatsHint />
      </div>
      <PlatformFilter value={platform} counts={platformCounts} onChange={setPlatform} />
      <CategoryBar value={category} counts={counts} onChange={setCategory} />
      {body}
    </main>
  );
}
