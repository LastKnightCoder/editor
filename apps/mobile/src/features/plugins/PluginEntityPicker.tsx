import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Z_INDEX } from "../../router/zIndex";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "ahooks";
import { Check } from "lucide-react";
import { cn } from "@tau/ui";
import type {
  MobileEntityCandidate,
  MobileEntityKind,
  MobileEntityPickRequest,
} from "../../app/plugins/app-types";
import { SearchField } from "../../components/SearchField";
import { SnapSheet } from "../../components/SnapSheet";
import { useNavigator, useRouterContext } from "../../router";

const KIND_LABELS: Record<MobileEntityKind, string> = {
  card: "卡片",
  article: "文章",
  project: "项目",
  document: "项目文档",
  diary: "日记",
  todo: "待办",
  event: "日程",
  "plugin-entity": "插件内容",
};
const itemKey = (item: MobileEntityCandidate) =>
  JSON.stringify([item.ref.kind, item.ref.id, item.identity]);

export function PluginEntityPicker({ request }: { request: MobileEntityPickRequest | null }) {
  return request ? <Picker key={request.id} request={request} /> : null;
}

function Picker({ request }: { request: MobileEntityPickRequest }) {
  const kinds = request.options.kinds.filter(
    (kind): kind is MobileEntityKind => kind in KIND_LABELS
  );
  const [kind, setKind] = useState(kinds[0]);
  const [search, setSearch] = useState("");
  const keyword = useDebounce(search.trim(), { wait: 250 });
  const [selected, setSelected] = useState(new Map<string, MobileEntityCandidate>());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [closed, setClosed] = useState(false);
  const [panelState, setPanelState] = useState<"normal" | "full">("normal");
  const active = useRef(!request.signal.aborted);
  const pending = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const client = useQueryClient();
  const navigator = useNavigator();
  useRouterContext();
  const entryId = (navigator.getTopOverlay() ?? navigator.getActiveScreen())?.id;
  const initialEntry = useRef(entryId);
  const queryKey = ["plugin-entity-picker", request.id] as const;

  const close = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    setClosed(true);
    const filter = { queryKey: ["plugin-entity-picker", request.id] };
    void client.cancelQueries(filter).then(() => client.removeQueries(filter));
  }, [client, request.id]);
  const cancel = useCallback(() => {
    if (!active.current || pending.current) return;
    close();
    request.cancel();
  }, [close, request]);

  useEffect(() => {
    if (request.signal.aborted) {
      setClosed(true);
      return;
    }
    active.current = true;
    request.signal.addEventListener("abort", close, { once: true });
    return () => {
      active.current = false;
      request.signal.removeEventListener("abort", close);
      const filter = { queryKey: ["plugin-entity-picker", request.id] };
      void client.cancelQueries(filter).then(() => client.removeQueries(filter));
    };
  }, [close, client, request]);

  useEffect(() => {
    if (closed || !entryId) return;
    if (entryId !== initialEntry.current) {
      cancel();
      return;
    }
    return navigator.registerBackHandler(
      entryId,
      () => {
        cancel();
        return true;
      },
      { blockEdgeBack: true }
    );
  }, [cancel, closed, entryId, navigator]);

  const results = useInfiniteQuery({
    queryKey: [...queryKey, kind, keyword],
    enabled: !!kind && !closed && !request.signal.aborted,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      request.query({ kind, keyword, cursor: pageParam, limit: 20, signal }),
    getNextPageParam: page => page.nextCursor,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const items = [
    ...new Map(
      (results.data?.pages.flatMap(page => page.items) ?? []).map(item => [itemKey(item), item])
    ).values(),
  ];
  const typing = search.trim() !== keyword;
  const unavailable = typing || submitting || results.isFetching || results.isError;

  const submit = async (items: MobileEntityCandidate[]) => {
    if (!active.current || request.signal.aborted || pending.current || !items.length) return;
    pending.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await request.submit(items);
      if (active.current) {
        active.current = false;
        setClosed(true);
      }
    } catch (error) {
      if (active.current) setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      pending.current = false;
      if (active.current) setSubmitting(false);
    }
  };

  const choose = (item: MobileEntityCandidate) => {
    if (!active.current || request.signal.aborted || pending.current || unavailable) return;
    if (!request.options.multiple) {
      void submit([item]);
      return;
    }
    setSubmitError("");
    setSelected(previous => {
      const next = new Map(previous);
      const key = itemKey(item);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  };

  if (closed || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={request.options.title}
      className="fixed inset-0"
      style={{ zIndex: Z_INDEX.CONFIRM }}
    >
      <SnapSheet
        open
        backDismiss={false}
        state={panelState}
        states={["normal", "full"]}
        onClose={cancel}
        onStateChange={state => {
          if (state === "normal" || state === "full") setPanelState(state);
        }}
        scrollRef={scrollRef}
      >
        <SnapSheet.Handle />
        <header className={cn("px-4 pb-3", panelState === "full" && "mobile-safe-top-gap")}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-ink-1 text-tau-body font-bold">{request.options.title}</h2>
            <button
              type="button"
              onClick={cancel}
              disabled={submitting}
              className="text-ink-2 text-tau-body shrink-0 disabled:opacity-50"
            >
              取消
            </button>
          </div>
          <p className="text-ink-3 text-tau-meta mt-1 mb-3">
            「{request.plugin.name}」将获得所选内容的引用和标题。
          </p>
          <SearchField
            value={search}
            onValueChange={setSearch}
            disabled={submitting}
            placeholder={`搜索${KIND_LABELS[kind] ?? "内容"}`}
          />
          <div aria-label="内容类型" className="mt-3 flex gap-2 overflow-x-auto">
            {kinds.map(value => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                disabled={submitting}
                onClick={() => setKind(value)}
                className={cn(
                  "text-tau-meta shrink-0 rounded-full px-3 py-2",
                  kind === value ? "bg-accent-soft text-accent-text" : "bg-page text-ink-2"
                )}
              >
                {KIND_LABELS[value]}
              </button>
            ))}
          </div>
        </header>
        <SnapSheet.Scroll ref={scrollRef} className="px-4 pb-4">
          {results.isError ? (
            <div role="alert" className="text-ink-2 text-tau-meta py-4">
              <p>{results.error instanceof Error ? results.error.message : "内容加载失败"}</p>
              <button
                type="button"
                onClick={() =>
                  void (results.isFetchNextPageError ? results.fetchNextPage() : results.refetch())
                }
                className="text-accent-text mt-2 py-2"
              >
                重新加载
              </button>
            </div>
          ) : null}
          {results.isPending || typing ? (
            <p role="status" className="text-ink-3 text-tau-meta py-4 text-center">
              正在查找…
            </p>
          ) : !results.isError && !items.length ? (
            <p className="text-ink-3 text-tau-meta py-8 text-center">
              没有可选择的{KIND_LABELS[kind]}
            </p>
          ) : null}
          <ul aria-label="可选内容">
            {items.map(item => {
              const checked = selected.has(itemKey(item));
              return (
                <li key={itemKey(item)}>
                  <button
                    type="button"
                    disabled={unavailable}
                    aria-pressed={request.options.multiple ? checked : undefined}
                    onClick={() => choose(item)}
                    className="active:bg-hover text-ink-1 text-tau-body flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1 break-words">
                      <span className="block">{item.title}</span>
                      {item.subtitle && (
                        <span className="text-ink-3 text-tau-meta block">{item.subtitle}</span>
                      )}
                    </span>
                    {checked ? (
                      <Check className="text-accent-text shrink-0" size={18} aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {results.hasNextPage ? (
            <button
              type="button"
              disabled={unavailable}
              onClick={() => void results.fetchNextPage()}
              className="text-accent-text text-tau-meta w-full py-3 disabled:opacity-50"
            >
              {results.isFetchingNextPage ? "正在加载…" : "加载更多"}
            </button>
          ) : null}
          {submitError ? (
            <p role="alert" className="text-ink-2 text-tau-meta py-3">
              {submitError}
            </p>
          ) : null}
          {request.options.multiple ? (
            <button
              type="button"
              disabled={submitting || !selected.size || typing}
              onClick={() => void submit([...selected.values()])}
              className="bg-accent text-ink-inverse text-tau-body mt-3 w-full rounded-xl px-4 py-3 font-semibold disabled:opacity-50"
            >
              {submitting ? "正在确认…" : `确认选择（${selected.size}）`}
            </button>
          ) : null}
        </SnapSheet.Scroll>
      </SnapSheet>
    </div>,
    document.body
  );
}
