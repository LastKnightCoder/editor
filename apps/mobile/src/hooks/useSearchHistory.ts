import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "tau-mobile-search-history";
const MAX_HISTORY = 10;

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // localStorage 不可用时忽略
    }
  }, [history]);

  const addHistory = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setHistory((prev) => {
      const filtered = prev.filter((item) => item !== trimmed);
      const newHistory = [trimmed, ...filtered].slice(0, MAX_HISTORY);
      return newHistory;
    });
  }, []);

  const removeHistory = useCallback((query: string) => {
    setHistory((prev) => prev.filter((item) => item !== query));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    history,
    addHistory,
    removeHistory,
    clearHistory,
  };
}
