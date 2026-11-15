import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { getFindSource, openOwnedFind, subscribeFindSource, type FindResults } from "./findOwner";
import { clearFindHighlights, showFindHighlights } from "./highlights";
import "./highlights.css";

const styles = {
  findBar:
    "bg-surface text-ink-1 font-tau text-tau-body rounded-tau-md fixed right-6 top-[58px] z-[10020] flex h-10 items-center gap-0.5 py-0 pl-3 pr-1.5 shadow-[0_0_0_1px_var(--tau-line-1),var(--tau-shadow-float)] animate-[tau-find-bar-in_var(--tau-dur-fast)_var(--tau-ease-out)] motion-reduce:animate-none max-[520px]:left-2 max-[520px]:right-2 max-[520px]:top-14",
  searchIcon: "text-ink-3 flex-none",
  input:
    "text-inherit placeholder:text-ink-3 h-7 w-[200px] border-0 bg-transparent px-2 font-[inherit] text-[inherit] outline-none max-[520px]:min-w-0 max-[520px]:w-auto max-[520px]:flex-1",
  resultCount:
    "text-ink-3 text-tau-sm min-w-11 whitespace-nowrap pl-1 pr-2 text-right tabular-nums data-[empty=true]:text-danger",
  iconButton:
    "text-ink-2 rounded-tau-sm inline-flex size-[26px] flex-none cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-colors hover:bg-hover hover:text-ink-1 active:bg-press focus-visible:shadow-[var(--tau-focus-ring)] focus-visible:outline-none disabled:cursor-default disabled:text-ink-3 disabled:opacity-50 disabled:hover:bg-transparent",
  divider: "bg-line-1 mx-1 h-4 w-px flex-none",
};

interface SearchTextNode {
  node: Text;
  start: number;
  end: number;
}

interface SearchState {
  results: FindResults | null;
  currentIndex: number;
}

const EMPTY_STATE: SearchState = { results: null, currentIndex: 0 };
const noFindSource = () => null;
const noFindSubscription = () => () => undefined;

const isSearchUiNode = (node: Node) =>
  node instanceof HTMLElement && Boolean(node.closest(`[data-global-find-ui="true"]`));

const collectTextNodes = (root: Node): SearchTextNode[] => {
  const result: SearchTextNode[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      if (isSearchUiNode(node.parentNode || node)) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, noscript, template")) {
        return NodeFilter.FILTER_REJECT;
      }

      if (!node.textContent) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let offset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const text = textNode.textContent || "";
    result.push({ node: textNode, start: offset, end: offset + text.length });
    offset += text.length;
  }

  return result;
};

const createRange = (nodes: SearchTextNode[], start: number, end: number): Range | null => {
  const startNode = nodes.find(item => start >= item.start && start < item.end);
  const endNode = nodes.find(item => end > item.start && end <= item.end);
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode.node, start - startNode.start);
  range.setEnd(endNode.node, end - endNode.start);
  return range;
};

const searchDocument = (query: string): FindResults => {
  const normalizedQuery = query.toLocaleLowerCase();
  const nodes = collectTextNodes(document.body);
  const fullText = nodes
    .map(item => item.node.textContent || "")
    .join("")
    .toLocaleLowerCase();
  const matches: Range[] = [];
  let start = fullText.indexOf(normalizedQuery);
  while (start !== -1) {
    const range = createRange(nodes, start, start + normalizedQuery.length);
    if (range) matches.push(range);
    start = fullText.indexOf(normalizedQuery, start + normalizedQuery.length);
  }

  return {
    count: matches.length,
    reveal(index, scroll) {
      const current = matches[index];
      showFindHighlights(current, matches);
      if (scroll)
        current?.startContainer.parentElement?.scrollIntoView?.({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
    },
  };
};

const GlobalFindBar = () => {
  const [open, setOpen] = useState(false);
  const source = useSyncExternalStore(
    open ? subscribeFindSource : noFindSubscription,
    open ? getFindSource : noFindSource,
    noFindSource
  );
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_STATE);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const searchStateRef = useRef<SearchState>(EMPTY_STATE);
  const revealFrame = useRef<number>(0);
  const releaseMatch = useRef<(() => void) | undefined>(undefined);

  const clearMatch = useCallback(() => {
    cancelAnimationFrame(revealFrame.current);
    releaseMatch.current?.();
    releaseMatch.current = undefined;
    clearFindHighlights();
  }, []);

  const showMatch = useCallback(
    ({ results, currentIndex }: SearchState, scroll: boolean) => {
      clearMatch();
      if (!results?.count) return;
      const show = () => {
        releaseMatch.current = results.reveal(currentIndex, scroll) ?? undefined;
      };
      if (source) revealFrame.current = requestAnimationFrame(show);
      else show();
    },
    [clearMatch, source]
  );

  const updateSearch = useCallback(
    (nextQuery: string, scroll: boolean) => {
      const trimmed = nextQuery.trim();
      const results = trimmed ? (source?.search(trimmed) ?? searchDocument(trimmed)) : null;
      const currentIndex = Math.min(
        searchStateRef.current.currentIndex,
        Math.max(0, (results?.count ?? 0) - 1)
      );
      const nextState = { results, currentIndex };
      searchStateRef.current = nextState;
      setSearchState(nextState);
      showMatch(nextState, scroll);
    },
    [showMatch, source]
  );

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const openFindBar = useCallback(() => {
    if (!open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    }
    focusInput();
  }, [focusInput, open]);

  const closeFindBar = useCallback(() => {
    clearMatch();
    searchStateRef.current = EMPTY_STATE;
    setSearchState(EMPTY_STATE);
    setQuery("");
    setOpen(false);
    requestAnimationFrame(() => previousFocusRef.current?.focus({ preventScroll: true }));
  }, [clearMatch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut =
        (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLocaleLowerCase() === "f";

      if (isFindShortcut) {
        event.preventDefault();
        event.stopPropagation();
        // 有区域接管查找（PDF 阅读器等）就交给它，页内文本查找让位
        if (openOwnedFind()) return;
        openFindBar();
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        closeFindBar();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [closeFindBar, open, openFindBar]);

  useEffect(() => {
    if (!open) return;
    updateSearch(query, true);
  }, [open, query, updateSearch]);

  useEffect(() => {
    if (!open || !query.trim()) return;
    if (source) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = source.subscribe(() => {
        clearTimeout(timer);
        timer = setTimeout(() => updateSearch(query, false), 150);
      });
      return () => {
        stop();
        clearTimeout(timer);
      };
    }
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateSearch(query, true);
      });
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [open, query, source, updateSearch]);

  useEffect(() => clearMatch, [clearMatch]);

  const selectResult = useCallback(
    (forward: boolean) => {
      const { results, currentIndex } = searchState;
      if (!results?.count) return;
      const nextIndex = (currentIndex + (forward ? 1 : -1) + results.count) % results.count;
      const nextState = { ...searchState, currentIndex: nextIndex };
      searchStateRef.current = nextState;
      setSearchState(nextState);
      showMatch(nextState, true);
    },
    [searchState, showMatch]
  );

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      selectResult(!event.shiftKey);
    }
  };

  if (!open) return null;

  const count = searchState.results?.count ?? 0;
  const resultLabel = query
    ? count > 0
      ? `${searchState.currentIndex + 1} / ${count}`
      : "无结果"
    : "";

  return createPortal(
    <div
      className={styles.findBar}
      role="search"
      aria-label="在当前窗口中搜索"
      data-global-find-ui="true"
    >
      <Search className={styles.searchIcon} size={14} aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder="搜索当前窗口"
        aria-label="搜索当前窗口"
        className={styles.input}
      />
      <span
        className={styles.resultCount}
        data-empty={query && count === 0 ? "true" : undefined}
        aria-live="polite"
      >
        {resultLabel}
      </span>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => selectResult(false)}
        disabled={count === 0}
        aria-label="上一个结果"
        title="上一个结果 (Shift+Enter)"
      >
        <ChevronUp size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => selectResult(true)}
        disabled={count === 0}
        aria-label="下一个结果"
        title="下一个结果 (Enter)"
      >
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <span className={styles.divider} aria-hidden="true" />
      <button
        type="button"
        className={styles.iconButton}
        onClick={closeFindBar}
        aria-label="关闭搜索"
        title="关闭搜索 (Esc)"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>,
    document.body
  );
};

export default GlobalFindBar;
