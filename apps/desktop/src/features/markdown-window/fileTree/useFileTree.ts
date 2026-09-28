import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  offDirectoryChanged,
  onDirectoryChanged,
  readDirectory,
  unwatchDirectory,
  watchDirectory,
} from "@/commands/file";
import { isSupportedFile } from "../fileTypes";
import { dirName, isWithin } from "../paths";
import { useMarkdownWindowPrefs } from "../markdownWindowPrefs";
import { sortEntries, type FilterResult, type TreeEntry, type TreeRow } from "./treeFilter";
import TreeFilterWorker from "./treeFilter.worker?worker";
import type { TreeFilterRequest, TreeFilterResponse } from "./treeFilter.worker";

export type { TreeEntry, TreeRow } from "./treeFilter";

const HIDDEN_NAMES = new Set(["node_modules"]);
/** 筛选时递归扫描的条目上限（超大目录只搜前这么多） */
const SCAN_LIMIT = 5000;
const CHANGE_DEBOUNCE_MS = 120;
/** 并发读目录数：串行逐层 IPC 往返是扫描慢的主因 */
const SCAN_CONCURRENCY = 8;
const QUERY_DEBOUNCE_MS = 120;
/** 筛选结果最多渲染的行数（每行带右键菜单，行数过多 DOM 太重） */
export const FILTER_ROW_LIMIT = 500;

function visible(entry: TreeEntry, showAll: boolean) {
  if (showAll) return true;
  if (entry.name.startsWith(".") || HIDDEN_NAMES.has(entry.name)) return false;
  return entry.isDirectory || isSupportedFile(entry.name);
}

/**
 * 文件树状态：按层懒加载（children 按目录缓存），目录监听只刷新变化的那一层；
 * 展开状态按根目录持久化；筛选时并发递归扫描整棵树（有上限），匹配与建树在 worker 里做（见 treeFilter），
 * 主线程只负责读目录与渲染。
 */
export function useFileTree(rootPath: string, query: string) {
  const showAll = useMarkdownWindowPrefs(s => s.showAllFiles);
  const rememberedExpanded = useMarkdownWindowPrefs(s => s.expanded[rootPath]);
  const setExpandedPref = useMarkdownWindowPrefs(s => s.setExpanded);

  const [children, setChildren] = useState<Map<string, TreeEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rememberedExpanded ?? []));
  const childrenRef = useRef(children);
  childrenRef.current = children;

  const loadDir = useCallback(
    async (dir: string) => {
      try {
        const entries = (await readDirectory(dir)).filter(entry => visible(entry, showAll));
        setChildren(prev => new Map(prev).set(dir, sortEntries(entries)));
      } catch {
        // 目录已不存在（被删 / 移走）：清掉缓存，父层刷新后自然消失
        setChildren(prev => {
          const next = new Map(prev);
          next.delete(dir);
          return next;
        });
      }
    },
    [showAll]
  );

  /** 重新读取所有已加载的目录（显示规则切换、手动刷新） */
  const reload = useCallback(async () => {
    const dirs = new Set([rootPath, ...childrenRef.current.keys()]);
    await Promise.all([...dirs].filter(dir => isWithin(dir, rootPath)).map(loadDir));
  }, [loadDir, rootPath]);

  // 根目录切换 / 显示规则变化：重建
  useEffect(() => {
    if (!rootPath) return;
    setChildren(new Map());
    void loadDir(rootPath);
    for (const dir of useMarkdownWindowPrefs.getState().expanded[rootPath] ?? []) void loadDir(dir);
    setExpanded(new Set(useMarkdownWindowPrefs.getState().expanded[rootPath] ?? []));
  }, [rootPath, loadDir]);

  useEffect(() => {
    if (rootPath) setExpandedPref(rootPath, [...expanded]);
  }, [expanded, rootPath, setExpandedPref]);

  // 监听根目录与展开的目录；变化只刷新那一层
  useEffect(() => {
    if (!rootPath) return;
    const dirs = [rootPath, ...[...expanded].filter(dir => isWithin(dir, rootPath))];
    dirs.forEach(dir => void watchDirectory(dir));
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const onChanged = (_event: unknown, payload: { directoryPath?: string }) => {
      const dir = payload?.directoryPath;
      if (!dir || !childrenRef.current.has(dir)) return;
      clearTimeout(timers.get(dir));
      timers.set(
        dir,
        setTimeout(() => {
          timers.delete(dir);
          void loadDir(dir);
        }, CHANGE_DEBOUNCE_MS)
      );
    };
    onDirectoryChanged(onChanged);
    return () => {
      offDirectoryChanged(onChanged);
      dirs.forEach(dir => void unwatchDirectory(dir));
      timers.forEach(clearTimeout);
    };
  }, [rootPath, expanded, loadDir]);

  const toggle = useCallback(
    (dir: string, open?: boolean) => {
      setExpanded(prev => {
        const next = new Set(prev);
        const shouldOpen = open ?? !next.has(dir);
        if (shouldOpen) next.add(dir);
        else next.delete(dir);
        return next;
      });
      if (open !== false && !childrenRef.current.has(dir)) void loadDir(dir);
    },
    [loadDir]
  );

  /** 展开到某个路径（打开文件 / 新建时让它可见） */
  const reveal = useCallback(
    (path: string) => {
      const ancestors: string[] = [];
      for (
        let dir = dirName(path);
        isWithin(dir, rootPath) && dir !== rootPath;
        dir = dirName(dir)
      ) {
        ancestors.push(dir);
      }
      if (!ancestors.length) return;
      setExpanded(prev => new Set([...prev, ...ancestors]));
      ancestors.forEach(dir => {
        if (!childrenRef.current.has(dir)) void loadDir(dir);
      });
    },
    [loadDir, rootPath]
  );

  /* 筛选：query 非空时并发递归扫描一次（结果缓存到 query 清空），交给 worker 建索引；
     之后每次（防抖后的）按键只把 query + 展开状态发给 worker，匹配与建树不占主线程 */
  const searching = query.trim().length > 0;
  const debouncedQuery = useDebouncedValue(query.trim(), QUERY_DEBOUNCE_MS);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [scanReady, setScanReady] = useState(false);
  const [filtered, setFiltered] = useState<FilterResult | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  useEffect(() => {
    setScanReady(false);
    setFiltered(null);
    if (!searching || !rootPath) return;
    let alive = true;
    void (async () => {
      const all: TreeEntry[] = [];
      let queue = [rootPath];
      while (queue.length && all.length < SCAN_LIMIT && alive) {
        const next: string[] = [];
        for (let i = 0; i < queue.length && all.length < SCAN_LIMIT; i += SCAN_CONCURRENCY) {
          const batch = await Promise.all(
            queue.slice(i, i + SCAN_CONCURRENCY).map(dir => readDirectory(dir).catch(() => []))
          );
          for (const entries of batch) {
            for (const entry of entries) {
              if (!visible(entry, showAll)) continue;
              all.push(entry);
              if (entry.isDirectory) next.push(entry.path);
            }
          }
        }
        queue = next;
      }
      if (!alive) return;
      if (!workerRef.current) {
        const worker = new TreeFilterWorker();
        worker.onmessage = (event: MessageEvent<TreeFilterResponse>) => {
          const { id, rows, truncated } = event.data;
          if (id !== requestIdRef.current) return; // 过期请求的结果丢弃
          setFiltered({ rows, truncated });
        };
        workerRef.current = worker;
      }
      workerRef.current.postMessage({
        type: "load",
        rootPath,
        entries: all,
      } satisfies TreeFilterRequest);
      setScanReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [searching, rootPath, showAll]);

  useEffect(() => {
    if (!scanReady || !debouncedQuery || !workerRef.current) return;
    workerRef.current.postMessage({
      type: "filter",
      id: ++requestIdRef.current,
      query: debouncedQuery,
      expanded: [...expanded],
      limit: FILTER_ROW_LIMIT,
    } satisfies TreeFilterRequest);
  }, [scanReady, debouncedQuery, expanded]);

  const rows = useMemo<TreeRow[]>(() => {
    if (searching) return filtered?.rows ?? [];
    const out: TreeRow[] = [];
    const walk = (dir: string, depth: number) => {
      for (const entry of children.get(dir) ?? []) {
        const open = entry.isDirectory && expanded.has(entry.path);
        out.push({ ...entry, depth, expanded: open });
        if (open) walk(entry.path, depth + 1);
      }
    };
    walk(rootPath, 0);
    return out;
  }, [children, expanded, rootPath, searching, filtered]);

  return {
    rows,
    loading: !children.has(rootPath) || (searching && !filtered),
    truncated: searching && !!filtered?.truncated,
    toggle,
    reveal,
    reload,
    refreshDir: loadDir,
  };
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
