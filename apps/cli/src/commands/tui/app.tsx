import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { CardListView } from "./views/card-list.js";
import { CardDetailView } from "./views/card-detail.js";
import { DbStatusView } from "./views/db-status.js";
import { SyncView } from "./views/sync.js";

type Page =
  | { type: "menu" }
  | { type: "card-list" }
  | { type: "card-detail"; cardId: number }
  | { type: "db-status" }
  | { type: "sync" };

const MENU_ITEMS = [
  { label: "Card List", description: "Browse and manage cards" },
  { label: "DB Status", description: "Database information" },
  { label: "Sync", description: "Database sync operations" },
  { label: "Quit", description: "Exit TUI" },
] as const;

function MainMenu({
  cursor,
  onSelect,
}: {
  cursor: number;
  onSelect: (index: number) => void;
}) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Tau TUI
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(40)}</Text>
      <Box flexDirection="column" marginY={1}>
        {MENU_ITEMS.map((item, i) => (
          <Box key={item.label}>
            <Text color={i === cursor ? "cyan" : undefined} bold={i === cursor}>
              {i === cursor ? "❯ " : "  "}
              {item.label}
            </Text>
            <Text dimColor> {item.description}</Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>{"─".repeat(40)}</Text>
      <Text dimColor>↑↓/jk navigate · Enter select · q quit</Text>
    </Box>
  );
}

export function TuiApp() {
  const { exit } = useApp();
  const [page, setPage] = useState<Page>({ type: "menu" });
  const [menuCursor, setMenuCursor] = useState(0);

  useInput((input, key) => {
    if (page.type === "menu") {
      if (input === "q" || (key.ctrl && input === "c")) {
        exit();
        return;
      }
      if (key.upArrow || input === "k") {
        setMenuCursor((c) => (c > 0 ? c - 1 : MENU_ITEMS.length - 1));
      } else if (key.downArrow || input === "j") {
        setMenuCursor((c) => (c < MENU_ITEMS.length - 1 ? c + 1 : 0));
      } else if (key.return) {
        switch (menuCursor) {
          case 0:
            setPage({ type: "card-list" });
            break;
          case 1:
            setPage({ type: "db-status" });
            break;
          case 2:
            setPage({ type: "sync" });
            break;
          case 3:
            exit();
            break;
        }
      }
    }
  });

  if (page.type === "menu") {
    return <MainMenu cursor={menuCursor} onSelect={() => {}} />;
  }

  if (page.type === "card-list") {
    return (
      <CardListView
        onBack={() => setPage({ type: "menu" })}
        onShowCard={(cardId) => setPage({ type: "card-detail", cardId })}
      />
    );
  }

  if (page.type === "card-detail") {
    return (
      <CardDetailView
        cardId={page.cardId}
        onBack={() => setPage({ type: "card-list" })}
      />
    );
  }

  if (page.type === "db-status") {
    return <DbStatusView onBack={() => setPage({ type: "menu" })} />;
  }

  if (page.type === "sync") {
    return <SyncView onBack={() => setPage({ type: "menu" })} />;
  }

  return null;
}
