import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { openOwnedFind } from "./findOwner";
import styles from "./index.module.less";

interface SearchTextNode {
  node: Text;
  start: number;
  end: number;
}

interface SearchMatch {
  range: Range;
}

interface SearchState {
  matches: SearchMatch[];
  currentIndex: number;
}

const EMPTY_STATE: SearchState = { matches: [], currentIndex: 0 };
const HIGHLIGHT_NAME = "tau-global-find";
const CURRENT_HIGHLIGHT_NAME = "tau-global-find-current";

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

const clearHighlights = () => {
  const css = (window as any).CSS;
  if (!css?.highlights) return;
  css.highlights.delete(HIGHLIGHT_NAME);
  css.highlights.delete(CURRENT_HIGHLIGHT_NAME);
};

const applyHighlights = (matches: SearchMatch[], currentIndex: number) => {
  const css = (window as any).CSS;
  if (!css?.highlights || typeof (window as any).Highlight !== "function") {
    return;
  }

  const allRanges = matches.map(match => match.range);
  css.highlights.set(HIGHLIGHT_NAME, new (window as any).Highlight(...allRanges));
  const current = matches[currentIndex];
  if (current) {
    css.highlights.set(CURRENT_HIGHLIGHT_NAME, new (window as any).Highlight(current.range));
  }
};

const scrollMatchIntoView = (match: SearchMatch | undefined) => {
  const element = match?.range.startContainer.parentElement;
  if (!element || typeof element.scrollIntoView !== "function") return;
  element.scrollIntoView({
    block: "center",
    inline: "nearest",
    behavior: "smooth",
  });
};

const searchDocument = (query: string, previousState: SearchState): SearchState => {
  clearHighlights();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return EMPTY_STATE;

  const nodes = collectTextNodes(document.body);
  const fullText = nodes
    .map(item => item.node.textContent || "")
    .join("")
    .toLocaleLowerCase();
  const matches: SearchMatch[] = [];
  let start = fullText.indexOf(normalizedQuery);
  while (start !== -1) {
    const range = createRange(nodes, start, start + normalizedQuery.length);
    if (range) matches.push({ range });
    start = fullText.indexOf(normalizedQuery, start + normalizedQuery.length);
  }

  const currentIndex = Math.min(previousState.currentIndex, Math.max(matches.length - 1, 0));
  applyHighlights(matches, currentIndex);
  return { matches, currentIndex };
};

const GlobalFindBar = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_STATE);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const searchStateRef = useRef<SearchState>(EMPTY_STATE);
  const refreshFrameRef = useRef<number | null>(null);

  const updateSearch = useCallback((nextQuery: string) => {
    const nextState = searchDocument(nextQuery, searchStateRef.current);
    searchStateRef.current = nextState;
    setSearchState(nextState);
    scrollMatchIntoView(nextState.matches[nextState.currentIndex]);
  }, []);

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
    clearHighlights();
    searchStateRef.current = EMPTY_STATE;
    setSearchState(EMPTY_STATE);
    setQuery("");
    setOpen(false);
    requestAnimationFrame(() => previousFocusRef.current?.focus());
  }, []);

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
    updateSearch(query);
  }, [open, query, updateSearch]);

  useEffect(() => {
    if (!open) return;
    const observer = new MutationObserver(() => {
      if (refreshFrameRef.current !== null) return;
      refreshFrameRef.current = requestAnimationFrame(() => {
        refreshFrameRef.current = null;
        updateSearch(query);
      });
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      if (refreshFrameRef.current !== null) {
        cancelAnimationFrame(refreshFrameRef.current);
        refreshFrameRef.current = null;
      }
    };
  }, [open, query, updateSearch]);

  useEffect(() => () => clearHighlights(), []);

  const selectResult = useCallback(
    (forward: boolean) => {
      if (searchState.matches.length === 0) return;
      const nextIndex =
        (searchState.currentIndex + (forward ? 1 : -1) + searchState.matches.length) %
        searchState.matches.length;
      const nextState = { ...searchState, currentIndex: nextIndex };
      searchStateRef.current = nextState;
      setSearchState(nextState);
      applyHighlights(nextState.matches, nextIndex);
      scrollMatchIntoView(nextState.matches[nextIndex]);
    },
    [searchState]
  );

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      selectResult(!event.shiftKey);
    }
  };

  if (!open) return null;

  const resultLabel = query
    ? searchState.matches.length > 0
      ? `${searchState.currentIndex + 1} / ${searchState.matches.length}`
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
        onChange={event => {
          setQuery(event.target.value);
          updateSearch(event.target.value);
        }}
        onKeyDown={handleInputKeyDown}
        placeholder="搜索当前窗口"
        aria-label="搜索当前窗口"
        className={styles.input}
      />
      <span
        className={styles.resultCount}
        data-empty={query && searchState.matches.length === 0 ? "true" : undefined}
        aria-live="polite"
      >
        {resultLabel}
      </span>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => selectResult(false)}
        disabled={searchState.matches.length === 0}
        aria-label="上一个结果"
        title="上一个结果 (Shift+Enter)"
      >
        <ChevronUp size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => selectResult(true)}
        disabled={searchState.matches.length === 0}
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
