// 引用内容选择器：空词列最近内容，有词按同一类型范围搜索，插件候选须声明可引用。
// 从选中文字进入时顶部提示这段文字会变成引用；「更换」进入时提示正在改哪个引用。

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useDebounce } from "ahooks";
import { FileSymlink, SearchX } from "lucide-react";
import { cn } from "@tau/ui";

import { SnapSheet } from "../../../components/SnapSheet";
import { SearchField } from "../../../components/SearchField";
import * as tauri from "../../../services/tauri";
import type { PluginEntityMetadata, UnifiedSearchResult } from "../../../types";
import {
  getMobilePluginEntityMetadata,
  isMobileEntityMentionable,
  useMobileEntityHostRevision,
  useMobileMentionableEntityKinds,
} from "../../../services/pluginEntities";
import { EntityKindIcon } from "../../context/EntityKindIcon";
import { toast } from "../../../components/toast";
import { formatTimeDisplay } from "../../../utils/formatTime";
import {
  CONTENT_LINK_SEARCH_TYPES,
  getContentLinkKindMeta,
  type ContentLinkPickerIntent,
  type ContentLinkTarget,
} from "./contentLinkModel";

const PAGE_SIZE = 20;
const STALE_MS = 10_000;

export type ContentLinkPickerResult = ContentLinkTarget & {
  displayText: string;
  pluginEntity?: PluginEntityMetadata;
};

type PickerOption = { key: string; result: ContentLinkPickerResult; meta: string };

const firstLine = (text: string | null | undefined) => text?.split("\n")[0]?.trim() ?? "";

/** 统一搜索的结果；没有 contentId 的条目（如日记）不能被引用，返回 null */
export function mapSearchResultToContentLinkResult(
  item: UnifiedSearchResult
): ContentLinkPickerResult | null {
  if (!item.contentId || item.contentId <= 0) return null;
  const label = getContentLinkKindMeta(item.type).label;
  const displayText = firstLine(item.title) || firstLine(item.excerpt) || `${label} #${item.id}`;
  return {
    contentId: item.contentId,
    contentType: item.type,
    contentTitle: displayText,
    refId: item.id,
    displayText,
    ...(item.pluginEntity ? { pluginEntity: item.pluginEntity } : {}),
  };
}

function optionMeta(contentType: string, updateTime: number, container?: string | null): string {
  return [getContentLinkKindMeta(contentType).label, container, formatTimeDisplay(updateTime)]
    .filter(Boolean)
    .join(" · ");
}

/** 标题里命中的关键词用 accent 字色加粗标出 */
function highlightMatch(text: string, keyword: string): ReactNode {
  const index = keyword ? text.toLowerCase().indexOf(keyword.toLowerCase()) : -1;
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="text-accent-text bg-transparent font-bold">
        {text.slice(index, index + keyword.length)}
      </mark>
      {text.slice(index + keyword.length)}
    </>
  );
}

function IntentHint({ intent }: { intent: ContentLinkPickerIntent }) {
  if (!intent.text) return null;
  return (
    <p className="bg-page text-ink-2 text-tau-sm mx-4 mb-2 flex items-center gap-1.5 rounded-xl px-3 py-2.5">
      <FileSymlink size={15} className="text-accent-text shrink-0" aria-hidden />
      <span className="min-w-0 truncate">
        {intent.mode === "replace" ? "更换" : "把"}
        <b className="text-ink-1 font-semibold">「{intent.text}」</b>
        {intent.mode === "replace" ? "引用的内容" : "链接到…"}
      </span>
    </p>
  );
}

type ContentLinkPickerSheetProps = {
  open: boolean;
  intent?: ContentLinkPickerIntent;
  onClose: () => void;
  onSelect: (result: ContentLinkPickerResult) => void;
};

export function ContentLinkPickerSheet(props: ContentLinkPickerSheetProps) {
  const { open, intent = { mode: "insert", text: "" }, onClose, onSelect } = props;

  const [panelState, setPanelState] = useState<"normal" | "full">("normal");
  const [query, setQuery] = useState("");
  const keyword = useDebounce(query.trim(), { wait: 250 });
  const kinds = useMobileMentionableEntityKinds();
  const hostRevision = useMobileEntityHostRevision();
  const [selecting, setSelecting] = useState(false);
  const selectingRef = useRef(false);
  const opened = useRef(open);
  const session = useRef(0);
  if (opened.current !== open) {
    opened.current = open;
    session.current++;
  }
  const current = useRef({ open, kinds, hostRevision });
  current.current = { open, kinds, hostRevision };

  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const nextPage = (page: { page: number; pageSize: number; total: number }) =>
    page.page * page.pageSize < page.total ? page.page + 1 : undefined;
  const search = useInfiniteQuery({
    queryKey: ["content-link", "picker", "search", hostRevision, keyword, kinds],
    initialPageParam: 1,
    getNextPageParam: nextPage,
    queryFn: ({ pageParam }) =>
      tauri.searchAllContent({
        query: keyword,
        page: pageParam,
        pageSize: PAGE_SIZE,
        types: CONTENT_LINK_SEARCH_TYPES,
        pluginEntityKinds: kinds,
      }),
    enabled: open,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!open) {
      setPanelState("normal");
      setQuery("");
      return;
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const options = useMemo<PickerOption[]>(() => {
    const results = search.data?.pages.flatMap(page => page.items) ?? [];
    const linked = results.flatMap(item => {
      const result = mapSearchResultToContentLinkResult(item);
      return result
        ? [
            {
              key: `${item.type}:${item.id}`,
              result,
              meta: [
                item.pluginEntity?.label,
                optionMeta(item.type, item.updateTime, item.containerTitle),
              ]
                .filter(Boolean)
                .join(" · "),
            },
          ]
        : [];
    });
    return [...new Map(linked.map(item => [item.key, item])).values()];
  }, [search.data]);

  const loading = search.isPending || search.isPlaceholderData;
  const error = search.isError;
  // 防抖期间关键词还没生效，列表仍是上一次的结果
  const typing = query.trim() !== keyword;
  const select = async (result: ContentLinkPickerResult) => {
    if (selectingRef.current || typing || search.isPlaceholderData) return;
    const version = hostRevision;
    const requestSession = session.current;
    selectingRef.current = true;
    setSelecting(true);
    try {
      if (result.contentType === "plugin-entity") {
        const metadata = await getMobilePluginEntityMetadata(result.refId, result.contentId);
        if (
          !current.current.open ||
          current.current.hostRevision !== version ||
          session.current !== requestSession
        )
          return;
        if (
          !metadata ||
          (result.pluginEntity && metadata.createdAt !== result.pluginEntity.createdAt) ||
          !isMobileEntityMentionable(metadata.pluginId, metadata.entityKind) ||
          !current.current.kinds.some(
            kind => kind.pluginId === metadata.pluginId && kind.kind === metadata.entityKind
          )
        ) {
          throw new Error("插件内容已变化或当前不可引用，请重新选择");
        }
      }
      if (
        current.current.open &&
        current.current.hostRevision === version &&
        session.current === requestSession
      )
        onSelect(result);
    } catch (error) {
      if (
        current.current.open &&
        current.current.hostRevision === version &&
        session.current === requestSession
      )
        toast({
          type: "warning",
          text: error instanceof Error ? error.message : "引用内容读取失败",
        });
    } finally {
      setSelecting(false);
      selectingRef.current = false;
    }
  };

  let emptyNode: ReactNode = null;
  if (options.length === 0) {
    emptyNode =
      loading || typing ? (
        <div className="border-accent mx-auto h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" />
      ) : (
        <>
          <SearchX size={30} className="text-ink-3 mx-auto" aria-hidden="true" />
          <p className="text-ink-3 text-tau-meta mt-3">
            {error
              ? "内容读取失败，请稍后重试"
              : keyword
                ? "未找到相关内容"
                : "暂无最近内容，输入关键词搜索文章或项目文档"}
          </p>
        </>
      );
  }

  return (
    <SnapSheet
      open={open}
      state={panelState}
      states={["normal", "full"]}
      normalHeight={0.62}
      onClose={onClose}
      onStateChange={nextState => {
        if (nextState === "normal" || nextState === "full") {
          setPanelState(nextState);
        }
      }}
      scrollRef={scrollRef}
      className="z-10060"
    >
      <>
        <SnapSheet.Handle />

        <header className={cn("px-4 pb-2", panelState === "full" && "mobile-safe-top-gap pb-3")}>
          <div className="flex items-center gap-3">
            <SearchField
              inputRef={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="搜索卡片、文章、项目文档或插件内容"
              className="flex-1"
            />
            <button type="button" onClick={onClose} className="text-ink-2 text-tau-body shrink-0">
              取消
            </button>
          </div>
        </header>
        <IntentHint intent={intent} />

        <SnapSheet.Scroll ref={scrollRef} className="px-3 pt-1">
          {!keyword && options.length > 0 ? (
            <p className="text-ink-3 text-tau-micro px-2 pt-1.5 pb-1 font-bold">最近可引用内容</p>
          ) : null}
          {options.length > 0 ? (
            <ul className={cn("transition-opacity", typing && "opacity-60")}>
              {options.map(({ key, result, meta }) => {
                const kind = getContentLinkKindMeta(result.contentType);
                const Icon = kind.icon;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      disabled={selecting || typing || search.isPlaceholderData}
                      className="active:bg-hover flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors"
                      onClick={() => void select(result)}
                    >
                      <span
                        className={cn(
                          "grid size-[34px] shrink-0 place-items-center rounded-[10px]",
                          kind.tone
                        )}
                      >
                        <EntityKindIcon svg={result.pluginEntity?.icon} fallback={Icon} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-ink-1 text-tau-body block truncate font-medium">
                          {highlightMatch(result.displayText, keyword)}
                        </span>
                        <span className="text-ink-3 text-tau-sm mt-0.5 block truncate">{meta}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-14 text-center">{emptyNode}</div>
          )}
          {search.hasNextPage && (
            <button
              type="button"
              disabled={search.isFetching || typing}
              onClick={() => void search.fetchNextPage()}
              className="text-accent-text w-full rounded-xl py-3 text-sm disabled:opacity-50"
            >
              {search.isFetchingNextPage
                ? "加载中…"
                : search.isFetchNextPageError
                  ? "加载失败，点按重试"
                  : "加载更多"}
            </button>
          )}
        </SnapSheet.Scroll>
      </>
    </SnapSheet>
  );
}

export default ContentLinkPickerSheet;
