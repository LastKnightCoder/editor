import React from "react";
import { render, Box, Text } from "ink";
import {
  executeSearch,
  getTypeBadge,
  SearchResult,
  IndexType,
} from "../../utils/search-service.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../utils/text.js";

interface SearchCommandOptions {
  type?: string;
  limit?: string;
}

function SearchResultsView({
  query,
  results,
  source,
}: {
  query: string;
  results: SearchResult[];
  source: string;
}) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Search: &quot;{query}&quot;
        </Text>
        <Text dimColor>
          {" "}
          ({results.length} results, source: {source})
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(70)}</Text>
      {results.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>No results found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {results.map((result, i) => {
            const badge = getTypeBadge(result.type);
            const title = truncateToWidth(result.title, 30);
            const time = formatRelativeTime(result.updateTime);
            return (
              <Box key={`${result.type}-${result.id}`}>
                <Text dimColor> {padEnd(`#${i + 1}`, 4)}</Text>
                <Text color={badge.color}>{padEnd(`[${badge.text}]`, 12)}</Text>
                <Text bold>{padEnd(title, 31)}</Text>
                <Text dimColor>{padEnd(result.snippet, 0)}</Text>
                <Text dimColor> {time}</Text>
              </Box>
            );
          })}
        </Box>
      )}
      <Text dimColor>{"─".repeat(70)}</Text>
    </Box>
  );
}

export async function runSearch(query: string, options: SearchCommandOptions) {
  const types = options.type
    ? (options.type.split(",").map((t) => t.trim()) as IndexType[])
    : undefined;
  const limit = parseInt(options.limit || "10", 10);

  const { results, source } = await executeSearch({
    query,
    types,
    limit,
    snippetWidth: 50,
  });
  render(<SearchResultsView query={query} results={results} source={source} />);
}
