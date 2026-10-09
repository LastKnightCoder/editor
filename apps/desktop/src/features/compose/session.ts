/**
 * 一次创作会话里白板与正文两栏共享的状态：白板实例、白板上的资料、正文已引用的、
 * 写作时亮起的那一张、检查连接时的编号与降淡。两栏各自写自己负责的字段。
 */

import { createContext, useContext } from "react";
import type { Editor } from "slate";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Board } from "@tau/whiteboard";
import type { BoardDocument } from "./model";

export interface ComposeGlow {
  key: string;
  elementId: string;
  /** 亮起时的段落（顶层块序号）：「连到此段」插在这段末尾 */
  block: number;
}

export interface ComposeSessionState {
  board: Board | null;
  getEditor: () => Editor | null | undefined;
  documents: BoardDocument[];
  cited: Set<string>;
  glow: ComposeGlow | null;
  /** 检查连接时：白板资料的编号（与正文画线对应）；为空表示不在洞见视图 */
  numbers: Map<string, number>;
  /** 洞见视图里当前那一处指向的资料 */
  focusKey: string | null;
  /** 洞见视图里还没处理的、可以引用白板资料的处数 */
  citable: number;
}

export type ComposeSession = StoreApi<ComposeSessionState>;

export function createComposeSession(getEditor: () => Editor | null | undefined): ComposeSession {
  return createStore<ComposeSessionState>(() => ({
    board: null,
    getEditor,
    documents: [],
    cited: new Set(),
    glow: null,
    numbers: new Map(),
    focusKey: null,
    citable: 0,
  }));
}

export const ComposeSessionContext = createContext<ComposeSession | null>(null);

export function useComposeSession<T>(selector: (state: ComposeSessionState) => T): T {
  const session = useContext(ComposeSessionContext);
  if (!session) throw new Error("useComposeSession 需要在 ComposeSessionContext 内使用");
  return useStore(session, selector);
}

export function useComposeSessionApi(): ComposeSession {
  const session = useContext(ComposeSessionContext);
  if (!session) throw new Error("useComposeSessionApi 需要在 ComposeSessionContext 内使用");
  return session;
}
