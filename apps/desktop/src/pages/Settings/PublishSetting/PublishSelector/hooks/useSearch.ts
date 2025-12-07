import { useState, useMemo } from "react";
import { useDebounce } from "ahooks";

interface UseSearchOptions<T> {
  items: T[];
  searchFields: (keyof T)[];
  debounceMs?: number;
}

interface UseSearchReturn<T> {
  query: string;
  setQuery: (query: string) => void;
  filteredItems: T[];
  isFiltering: boolean;
}

export function useSearch<T>({
  items,
  searchFields,
  debounceMs = 300,
}: UseSearchOptions<T>): UseSearchReturn<T> {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, { wait: debounceMs });
  const isFiltering = query !== debouncedQuery;

  const filteredItems = useMemo(() => {
    if (!debouncedQuery.trim()) return items;

    const lower = debouncedQuery.toLowerCase().trim();
    return items.filter((item) =>
      searchFields.some((field) => {
        const value = (item as Record<string, unknown>)[field as string];
        if (typeof value === "string") {
          return value.toLowerCase().includes(lower);
        }
        if (Array.isArray(value)) {
          return value.some(
            (v) => typeof v === "string" && v.toLowerCase().includes(lower),
          );
        }
        return false;
      }),
    );
  }, [items, debouncedQuery, searchFields]);

  return {
    query,
    setQuery,
    filteredItems,
    isFiltering,
  };
}
