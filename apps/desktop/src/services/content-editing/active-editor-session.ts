import { Descendant, Range } from "slate";
import type { ActiveEditingSession, EntityType, SerializedSelection } from "./types";
import { createContentSnapshot } from "./snapshot";

const sessions = new Map<string, ActiveEditingSession>();

const toSerializedSelection = (selection: Range | null): SerializedSelection | null => {
  if (!selection) return null;
  return {
    anchor: {
      path: [...selection.anchor.path],
      offset: selection.anchor.offset,
    },
    focus: {
      path: [...selection.focus.path],
      offset: selection.focus.offset,
    },
    isCollapsed: Range.isCollapsed(selection),
  };
};

const now = () => Date.now();

export const createActiveEditingSessionId = (): string => {
  return `session_${now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const upsertActiveEditingSession = (payload: {
  sessionId: string;
  contentId: number;
  entityType: EntityType;
  entityId: number;
  tabId?: string;
  paneId?: string;
  tabType?: string;
  content: Descendant[];
}) => {
  const current = sessions.get(payload.sessionId);
  const ts = now();
  const next: ActiveEditingSession = {
    id: payload.sessionId,
    contentId: payload.contentId,
    entityType: payload.entityType,
    entityId: payload.entityId,
    tabId: payload.tabId,
    paneId: payload.paneId,
    tabType: payload.tabType,
    focused: current?.focused ?? false,
    selection: current?.selection ?? null,
    snapshot: createContentSnapshot(payload.content, "active-session"),
    updatedAt: ts,
    focusedAt: current?.focusedAt ?? 0,
  };
  sessions.set(payload.sessionId, next);
  return next;
};

export const removeActiveEditingSession = (sessionId: string) => {
  sessions.delete(sessionId);
};

export const updateActiveEditingSessionContent = (sessionId: string, content: Descendant[]) => {
  const current = sessions.get(sessionId);
  if (!current) return null;
  const updated: ActiveEditingSession = {
    ...current,
    snapshot: createContentSnapshot(content, "active-session"),
    updatedAt: now(),
  };
  sessions.set(sessionId, updated);
  return updated;
};

export const updateActiveEditingSessionSelection = (sessionId: string, selection: Range | null) => {
  const current = sessions.get(sessionId);
  if (!current) return null;
  const updated: ActiveEditingSession = {
    ...current,
    selection: toSerializedSelection(selection),
    updatedAt: now(),
  };
  sessions.set(sessionId, updated);
  return updated;
};

export const setActiveEditingSessionFocus = (sessionId: string, focused: boolean) => {
  const current = sessions.get(sessionId);
  if (!current) return null;
  const ts = now();
  const updated: ActiveEditingSession = {
    ...current,
    focused,
    focusedAt: focused ? ts : current.focusedAt,
    updatedAt: ts,
  };
  sessions.set(sessionId, updated);
  return updated;
};

export const getAllActiveEditingSessions = (): ActiveEditingSession[] => {
  return [...sessions.values()];
};

export const getActiveEditingSession = (): ActiveEditingSession | null => {
  const values = [...sessions.values()];
  if (values.length === 0) return null;

  const focused = values
    .filter(session => session.focused)
    .sort((a, b) => b.focusedAt - a.focusedAt);
  if (focused.length > 0) {
    return focused[0];
  }

  values.sort((a, b) => b.updatedAt - a.updatedAt);
  return values[0];
};

export const getActiveEditingSessionByContentId = (
  contentId: number
): ActiveEditingSession | null => {
  const matched = [...sessions.values()].filter(session => session.contentId === contentId);
  if (matched.length === 0) return null;
  matched.sort((a, b) => {
    if (a.focused !== b.focused) return a.focused ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
  return matched[0];
};

export const getActiveEditingSessionById = (sessionId: string): ActiveEditingSession | null => {
  return sessions.get(sessionId) || null;
};
