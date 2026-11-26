import { useEffect, useRef, useState } from "react";
import { retainQueryRuntime, startQuery } from "@tau/shared/query-database/client";
import { createQuerySession } from "@tau/shared/query-database";
import type { QueryDefinition, QueryResult, QuerySource } from "@tau/shared/query-database";
import { useDatabaseConnectionId } from "@/hooks/useDatabaseCommands";
import useSettingStore from "@/stores/useSettingStore";
import { on, off } from "@/electron";
import type { DomainEventMessage } from "@/types/domain-events";
import { createQueryReader } from "./read";

const domains: Record<string, QuerySource> = {
  card: "cards",
  article: "articles",
  document: "documents",
  project: "projects",
  todo: "todos",
  event: "calendar",
  whiteboard: "whiteboards",
  notebook: "notebooks",
  material: "materials",
  chat: "chats",
};

export function useQueryDatabase(definition: QueryDefinition) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const connectionId = useDatabaseConnectionId(databaseName);
  const [state, setState] = useState<{
    result?: QueryResult;
    error?: string;
    loading: boolean;
    binding?: string;
  }>({ loading: true });
  const refresh = useRef<(() => void) | null>(null);
  const code = JSON.stringify(definition);
  const binding = `${databaseName}:${connectionId ?? ""}`;
  useEffect(() => {
    const releaseRuntime = retainQueryRuntime();
    const controller = new AbortController();
    const dependencies = new Set<QuerySource>();
    const read = createQueryReader(databaseName, connectionId, controller.signal);
    let clock = false;
    const session = createQuerySession({
      run: () => {
        const now = new Date();
        return startQuery({
          definition: JSON.parse(code),
          context: {
            now: now.getTime(),
            today: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            params: JSON.parse(code).params ?? {},
          },
          read,
          onDependency: source => dependencies.add(source),
          onClock: () => {
            clock = true;
          },
        });
      },
      publish: result => setState({ result, loading: false, binding }),
      fail: error =>
        setState(previous => ({
          ...previous,
          error: error.message,
          loading: false,
          binding,
        })),
      loading: loading =>
        setState(previous => ({
          ...(previous.binding === binding ? previous : {}),
          loading,
          binding,
        })),
    });
    refresh.current = () => session.invalidate();
    const changed = (_: unknown, message: DomainEventMessage) => {
      if (message.databaseName.replace(/\.db$/, "") !== databaseName.replace(/\.db$/, "")) return;
      if (
        message.events.some(
          event =>
            event.type === "workspace.reset" ||
            !dependencies.size ||
            dependencies.has("contents") ||
            (event.type.startsWith("project.") && dependencies.has("documents")) ||
            dependencies.has(domains[event.type.split(".")[0]])
        )
      )
        session.invalidate();
    };
    const diaryChanged = () => {
      if (dependencies.has("diary")) session.invalidate();
    };
    const tableChanged = () => {
      if (dependencies.has("tables")) session.invalidate();
    };
    const visible = () => session.setActive(!document.hidden);
    const interval = setInterval(() => {
      if (clock) session.invalidate();
    }, 60_000);
    on("domain-events", changed);
    on("diary:changed", diaryChanged);
    on("query-database:changed", tableChanged);
    document.addEventListener("visibilitychange", visible);
    visible();
    session.invalidate();
    return () => {
      session.dispose();
      controller.abort();
      clearInterval(interval);
      off("domain-events", changed);
      off("diary:changed", diaryChanged);
      off("query-database:changed", tableChanged);
      document.removeEventListener("visibilitychange", visible);
      releaseRuntime();
    };
  }, [code, databaseName, connectionId, binding]);
  return {
    ...(state.binding === binding ? state : { loading: true }),
    refresh: () => refresh.current?.(),
  };
}
