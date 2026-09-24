import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { CardListView } from "./views/card-list.js";
import { CardDetailView } from "./views/card-detail.js";
import { ArticleListView } from "./views/article-list.js";
import { ArticleDetailView } from "./views/article-detail.js";
import { ProjectListView } from "./views/project-list.js";
import { ProjectDetailView } from "./views/project-detail.js";
import { ProjectItemDetailView } from "./views/project-item-detail.js";
import { SearchView } from "./views/search.js";
import { TodoListView } from "./views/todo-list.js";
import { TodoDetailView } from "./views/todo-detail.js";
import { TodoGroupListView } from "./views/todo-group-list.js";
import { QuestionListView } from "./views/question-list.js";
import { QuestionDetailView } from "./views/question-detail.js";
import { AnswerDetailView } from "./views/answer-detail.js";
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
  | { type: "todo-list"; groupId?: number; systemType?: string }
  | { type: "todo-detail"; todoId: number; backTo?: Page }
  | { type: "todo-group-list" }
  | { type: "question-list"; groupId?: number }
  | { type: "question-detail"; questionId: number; backTo?: Page }
  | {
      type: "answer-detail";
      questionId: number;
      answerIndex: number;
      backTo?: Page;
    }
  | { type: "db-status" }
  | { type: "sync" };

const MENU_ITEMS = [
  { label: "Search", description: "Search all content (FTS + Vec)" },
  { label: "Card List", description: "Browse and manage cards" },
  { label: "Article List", description: "Browse articles" },
  { label: "Project List", description: "Browse projects" },
  { label: "Todo List", description: "Manage tasks and todos" },
  { label: "Todo Groups", description: "View task groups" },
  { label: "Questions", description: "Browse questions and answers" },
  { label: "DB Status", description: "Database information" },
  { label: "Sync", description: "Database sync operations" },
  { label: "Quit", description: "Exit TUI" },
] as const;

function MainMenu({ cursor, onSelect }: { cursor: number; onSelect: (index: number) => void }) {
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
        setMenuCursor(c => (c > 0 ? c - 1 : MENU_ITEMS.length - 1));
      } else if (key.downArrow || input === "j") {
        setMenuCursor(c => (c < MENU_ITEMS.length - 1 ? c + 1 : 0));
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
            setPage({ type: "todo-list" });
            break;
          case 5:
            setPage({ type: "todo-group-list" });
            break;
          case 6:
            setPage({ type: "question-list" });
            break;
          case 7:
            setPage({ type: "db-status" });
            break;
          case 8:
            setPage({ type: "sync" });
            break;
          case 9:
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
        onShowCard={cardId => setPage({ type: "card-detail", cardId })}
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
        onShowArticle={articleId => setPage({ type: "article-detail", articleId })}
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
        onShowProject={projectId => setPage({ type: "project-detail", projectId })}
      />
    );
  }

  if (page.type === "project-detail") {
    return (
      <ProjectDetailView
        projectId={page.projectId}
        onBack={() => setPage({ type: "project-list" })}
        onShowProjectItem={itemId =>
          setPage({
            type: "project-item-detail",
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
        onShowProjectItem={id =>
          setPage({
            type: "project-item-detail",
            itemId: id,
            backTo: page,
          })
        }
      />
    );
  }

  if (page.type === "todo-list") {
    return (
      <TodoListView
        initialGroupId={page.groupId}
        initialSystemType={page.systemType}
        onBack={() => setPage({ type: "menu" })}
        onShowTodo={todoId => setPage({ type: "todo-detail", todoId, backTo: page })}
      />
    );
  }

  if (page.type === "todo-detail") {
    return (
      <TodoDetailView
        todoId={page.todoId}
        onBack={() => setPage(page.backTo ?? { type: "todo-list" })}
        onShowSubtask={id => setPage({ type: "todo-detail", todoId: id, backTo: page })}
      />
    );
  }

  if (page.type === "todo-group-list") {
    return (
      <TodoGroupListView
        onBack={() => setPage({ type: "menu" })}
        onSelectGroup={selection =>
          setPage({
            type: "todo-list",
            groupId: selection.groupId,
            systemType: selection.systemType,
          })
        }
      />
    );
  }

  if (page.type === "question-list") {
    return (
      <QuestionListView
        initialGroupId={page.groupId}
        onBack={() => setPage({ type: "menu" })}
        onShowQuestion={questionId =>
          setPage({ type: "question-detail", questionId, backTo: page })
        }
      />
    );
  }

  if (page.type === "question-detail") {
    return (
      <QuestionDetailView
        questionId={page.questionId}
        onBack={() => setPage(page.backTo ?? { type: "question-list" })}
        onShowAnswer={(questionId, answerIndex) =>
          setPage({
            type: "answer-detail",
            questionId,
            answerIndex,
            backTo: page,
          })
        }
      />
    );
  }

  if (page.type === "answer-detail") {
    return (
      <AnswerDetailView
        questionId={page.questionId}
        answerIndex={page.answerIndex}
        onBack={() => setPage(page.backTo ?? { type: "question-list" })}
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
