import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { CardListView } from "./views/card-list.js";
import { CardDetailView } from "./views/card-detail.js";
import { ArticleListView } from "./views/article-list.js";
import { ArticleDetailView } from "./views/article-detail.js";
import { ProjectListView } from "./views/project-list.js";
import { ProjectDetailView } from "./views/project-detail.js";
import { DocumentListView } from "./views/document-list.js";
import { DocumentDetailView } from "./views/document-detail.js";
import { ProjectItemDetailView } from "./views/project-item-detail.js";
import { DocumentItemDetailView } from "./views/document-item-detail.js";
import { SearchView } from "./views/search.js";
import { DbStatusView } from "./views/db-status.js";
import { SyncView } from "./views/sync.js";

type Page =
  | { type: "menu" }
  | { type: "search" }
  | { type: "card-list" }
  | { type: "card-detail"; cardId: number; backTo?: Page }
  | { type: "article-list" }
  | { type: "article-detail"; articleId: number; backTo?: Page }
  | { type: "project-list" }
  | { type: "project-detail"; projectId: number }
  | { type: "project-item-detail"; itemId: number; backTo: Page }
  | { type: "document-list" }
  | { type: "document-detail"; docId: number }
  | { type: "document-item-detail"; itemId: number; backTo: Page }
  | { type: "db-status" }
  | { type: "sync" };

const MENU_ITEMS = [
  { label: "Search", description: "Search all content (FTS + Vec)" },
  { label: "Card List", description: "Browse and manage cards" },
  { label: "Article List", description: "Browse articles" },
  { label: "Project List", description: "Browse projects" },
  { label: "Document List", description: "Browse documents" },
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
            setPage({ type: "search" });
            break;
          case 1:
            setPage({ type: "card-list" });
            break;
          case 2:
            setPage({ type: "article-list" });
            break;
          case 3:
            setPage({ type: "project-list" });
            break;
          case 4:
            setPage({ type: "document-list" });
            break;
          case 5:
            setPage({ type: "db-status" });
            break;
          case 6:
            setPage({ type: "sync" });
            break;
          case 7:
            exit();
            break;
        }
      }
    }
  });

  if (page.type === "menu") {
    return <MainMenu cursor={menuCursor} onSelect={() => {}} />;
  }

  if (page.type === "search") {
    return (
      <SearchView
        onBack={() => setPage({ type: "menu" })}
        onNavigate={(type, id) => {
          switch (type) {
            case "card":
              setPage({
                type: "card-detail",
                cardId: id,
                backTo: { type: "search" },
              });
              break;
            case "article":
              setPage({
                type: "article-detail",
                articleId: id,
                backTo: { type: "search" },
              });
              break;
            case "project-item":
              setPage({
                type: "project-item-detail",
                itemId: id,
                backTo: { type: "search" },
              });
              break;
            case "document-item":
              setPage({
                type: "document-item-detail",
                itemId: id,
                backTo: { type: "search" },
              });
              break;
            default:
              break;
          }
        }}
      />
    );
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
        onBack={() => setPage(page.backTo ?? { type: "card-list" })}
      />
    );
  }

  if (page.type === "article-list") {
    return (
      <ArticleListView
        onBack={() => setPage({ type: "menu" })}
        onShowArticle={(articleId) =>
          setPage({ type: "article-detail", articleId })
        }
      />
    );
  }

  if (page.type === "article-detail") {
    return (
      <ArticleDetailView
        articleId={page.articleId}
        onBack={() => setPage(page.backTo ?? { type: "article-list" })}
      />
    );
  }

  if (page.type === "project-list") {
    return (
      <ProjectListView
        onBack={() => setPage({ type: "menu" })}
        onShowProject={(projectId) =>
          setPage({ type: "project-detail", projectId })
        }
      />
    );
  }

  if (page.type === "project-detail") {
    return (
      <ProjectDetailView
        projectId={page.projectId}
        onBack={() => setPage({ type: "project-list" })}
        onShowProjectItem={(itemId) =>
          setPage({
            type: "project-item-detail",
            itemId,
            backTo: page,
          })
        }
      />
    );
  }

  if (page.type === "document-list") {
    return (
      <DocumentListView
        onBack={() => setPage({ type: "menu" })}
        onShowDocument={(docId) => setPage({ type: "document-detail", docId })}
      />
    );
  }

  if (page.type === "document-detail") {
    return (
      <DocumentDetailView
        docId={page.docId}
        onBack={() => setPage({ type: "document-list" })}
        onShowDocumentItem={(itemId) =>
          setPage({
            type: "document-item-detail",
            itemId,
            backTo: page,
          })
        }
      />
    );
  }

  if (page.type === "project-item-detail") {
    return (
      <ProjectItemDetailView
        itemId={page.itemId}
        onBack={() => setPage(page.backTo)}
        onShowProjectItem={(id) =>
          setPage({
            type: "project-item-detail",
            itemId: id,
            backTo: page,
          })
        }
      />
    );
  }

  if (page.type === "document-item-detail") {
    return (
      <DocumentItemDetailView
        itemId={page.itemId}
        onBack={() => setPage(page.backTo)}
        onShowDocumentItem={(id) =>
          setPage({
            type: "document-item-detail",
            itemId: id,
            backTo: page,
          })
        }
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
