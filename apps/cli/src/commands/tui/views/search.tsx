import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { closeDataAccess } from "../../../data-access/index.js";
import { IndexType } from "../../../data-access/index-db.js";
import { executeSearch, getTypeBadge, SearchResult } from "../../../utils/search-service.js";
import { formatRelativeTime, truncateToWidth, padEnd } from "../../../utils/text.js";

const TYPE_FILTERS: Array<{ label: string; types: IndexType[] | undefined }> = [
  { label: "全部", types: undefined },
  { label: "Card", types: ["card"] },
  { label: "Article", types: ["article"] },
  { label: "Project", types: ["project-item"] },
];

export function SearchView({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate: (type: IndexType, id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cursor, setCursor] = useState(0);
  const [filterIndex, setFilterIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [source, setSource] = useState("");
  const [inputMode, setInputMode] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, types: IndexType[] | undefined) => {
    if (!q.trim()) {
      setResults([]);
      setSource("");
      return;
    }

    setSearching(true);
    const { results, source } = await executeSearch({
      query: q,
      types,
      limit: 20,
      snippetWidth: 40,
    });
    setResults(results);
    setSource(source);
    setCursor(0);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const types = TYPE_FILTERS[filterIndex].types;
      doSearch(query, types);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filterIndex, doSearch]);

  useInput((input, key) => {
    if (inputMode) {
      if (key.escape) {
        if (query) {
          setQuery("");
          setResults([]);
        } else {
          closeDataAccess();
          onBack();
        }
        return;
      }
      if (key.return) {
        if (results.length > 0) {
          setInputMode(false);
        }
        return;
      }
      if (key.tab) {
        setFilterIndex(i => (i + 1) % TYPE_FILTERS.length);
        return;
      }
      if (key.backspace || key.delete) {
        setQuery(s => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl) {
        setQuery(s => s + input);
      }
      return;
    }

    // Navigation mode
    if (key.escape || input === "q") {
      setInputMode(true);
      return;
    }
    if (input === "/") {
      setInputMode(true);
      return;
    }
    if (key.upArrow || input === "k") {
      setCursor(c => (c > 0 ? c - 1 : results.length - 1));
    } else if (key.downArrow || input === "j") {
      setCursor(c => (c < results.length - 1 ? c + 1 : 0));
    } else if (key.tab) {
      setFilterIndex(i => (i + 1) % TYPE_FILTERS.length);
    } else if (key.return) {
      const result = results[cursor];
      if (result) {
        closeDataAccess();
        onNavigate(result.type, result.id);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Search
        </Text>
        <Text dimColor> [</Text>
        {TYPE_FILTERS.map((f, i) => (
          <React.Fragment key={f.label}>
            {i > 0 && <Text dimColor> | </Text>}
            <Text color={i === filterIndex ? "cyan" : undefined} bold={i === filterIndex}>
              {f.label}
            </Text>
          </React.Fragment>
        ))}
        <Text dimColor>]</Text>
        {source && <Text dimColor> ({source})</Text>}
      </Box>
      <Text dimColor>{"─".repeat(76)}</Text>

      <Box>
        <Text color={inputMode ? "yellow" : "white"}>{inputMode ? "❯ " : "  "}</Text>
        <Text>{query}</Text>
        {inputMode && <Text dimColor>█</Text>}
        {searching && <Text dimColor> (searching...)</Text>}
      </Box>

      <Text dimColor>{"─".repeat(76)}</Text>

      {results.length === 0 && query.trim() && !searching ? (
        <Box marginY={1}>
          <Text dimColor>No results found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {results.map((result, i) => {
            const isSelected = !inputMode && i === cursor;
            const badge = getTypeBadge(result.type);
            const title = truncateToWidth(result.title, 28);
            const time = formatRelativeTime(result.updateTime);
            return (
              <Box key={`${result.type}-${result.id}-${i}`}>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {isSelected ? "❯" : " "} {padEnd(`${i + 1}.`, 4)}
                </Text>
                <Text color={badge.color}>{padEnd(`[${badge.text}]`, 12)}</Text>
                <Text color={isSelected ? "white" : undefined}>{padEnd(title, 29)}</Text>
                <Text dimColor>{padEnd(result.snippet, 0)}</Text>
                <Text dimColor> {time}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Text dimColor>{"─".repeat(76)}</Text>
      {inputMode ? (
        <Text dimColor>Type to search · Tab filter · Enter navigate results · Esc back</Text>
      ) : (
        <Text dimColor>
          ↑↓/jk navigate · Enter open · / edit query · Tab filter · Esc back to input
        </Text>
      )}
    </Box>
  );
}
