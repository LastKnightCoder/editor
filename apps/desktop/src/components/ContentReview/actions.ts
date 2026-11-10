/**
 * 建议的处理动作由对话卡片发起，每个动作都是对主进程记录的条件更新，
 * 另一视图已处理的条目原样返回其结果，界面随广播刷新，不在这里改本地状态。
 */

import { useState } from "react";
import { create } from "zustand";
import { toast } from "@tau/ui";
import { bindDatabaseCommands } from "@/services/command-context";
import {
  acceptContentSuggestions,
  answerContentQuestion,
  rejectContentSuggestions,
  undoContentSuggestions,
} from "@/commands/content";
import {
  requestSuggestionContinuation,
  requestSuggestionRewrite,
} from "@/services/content-editing/follow-up";
import type { ContentSuggestion } from "@/types/content-suggestion";

type Action = "accept" | "reject" | "rewrite" | "undo" | "answer" | "continue";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useSuggestionActions(databaseName: string) {
  const [busy, setBusy] = useState<{ action: Action; ids: string[] } | null>(null);
  const commands = () =>
    bindDatabaseCommands(
      {
        acceptContentSuggestions,
        rejectContentSuggestions,
        undoContentSuggestions,
        answerContentQuestion,
      },
      { databaseName }
    );
  const run = async (action: Action, items: ContentSuggestion[], task: () => Promise<void>) => {
    if (!items.length) return false;
    setBusy({ action, ids: items.map(item => item.id) });
    try {
      await task();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const ids = (items: ContentSuggestion[]) => items.map(item => item.id);
  return {
    /** 某条（或某组）正在执行的动作 */
    busyOn: (item: ContentSuggestion) => (busy?.ids.includes(item.id) ? busy.action : undefined),
    busy: busy !== null,
    accept: (items: ContentSuggestion[]) =>
      run("accept", items, async () => {
        // 直接改让出的条目「让它接着改」：本机正文接着逐段打字；普通建议整条提交
        const outcomes = await commands().acceptContentSuggestions(items[0].contentId, ids(items), {
          typing: true,
        });
        const expired = outcomes.filter(outcome => outcome.status === "expired");
        const pending = outcomes.filter(
          outcome => outcome.status === "pending" || outcome.status === "applying"
        );
        if (expired.length) toast.warning(expired[0].error ?? `${expired.length} 条修改已过期`);
        else if (pending.length) toast.info(pending[0].error ?? "提交结果尚未确认，可稍后重试");
      }),
    reject: (items: ContentSuggestion[], feedback?: string) =>
      run("reject", items, async () => {
        await commands().rejectContentSuggestions(items[0].contentId, ids(items), feedback);
      }),
    rewrite: (item: ContentSuggestion) =>
      run("rewrite", [item], async () => {
        if (!(await requestSuggestionRewrite(databaseName, item)))
          toast.warning("已退回这条；原对话不在主聊天里，请到原对话中让它重写");
      }),
    continueEdit: (item: ContentSuggestion, instruction: string) =>
      run("continue", [item], async () => {
        if (!(await requestSuggestionContinuation(databaseName, item, instruction)))
          throw new Error("继续修改请求未送达，请在原对话中重试");
      }),
    undo: (items: ContentSuggestion[]) =>
      run("undo", items, async () => {
        const outcomes = await commands().undoContentSuggestions(items[0].contentId, ids(items));
        const failed = outcomes.find(outcome => outcome.status !== "undone");
        if (failed) toast.error(failed.error ?? "撤销失败");
        else if (!outcomes.length) toast.error("没有可撤销的修改");
      }),
    answer: (item: ContentSuggestion, answer: string) =>
      run("answer", [item], async () => {
        if (!(await commands().answerContentQuestion(item.contentId, item.id, answer)))
          toast.warning("这个问题已经处理过了");
      }),
  };
}

export type SuggestionActions = ReturnType<typeof useSuggestionActions>;

/** 只有从对话选中的改动才在正文叠加痕迹。 */
export const useSuggestionFocus = create<{
  focused: { id: string; from: "mark" | "card" } | null;
  focus(id: string, from: "mark" | "card"): void;
  clear(id?: string): void;
}>(set => ({
  focused: null,
  focus: (id, from) => set({ focused: { id, from } }),
  clear: id => set(state => (!id || state.focused?.id === id ? { focused: null } : state)),
}));

/** 正文里一条建议痕迹的 DOM 锚（ScopedEditMarks 渲染时挂上） */
export const SUGGESTION_MARK_ATTR = "data-suggestion-mark";

export function scrollToSuggestionMark(id: string) {
  const marks = document.querySelectorAll(`[${SUGGESTION_MARK_ATTR}="${CSS.escape(id)}"]`);
  const mark = Array.from(marks).find(element => element.getClientRects().length > 0);
  mark?.scrollIntoView({ behavior: "smooth", block: "center" });
  return Boolean(mark);
}

/** 只定位当前窗口已有的对应正文，换选后停止之前的滚动。 */
export function focusSuggestionInDocument(id: string) {
  useSuggestionFocus.getState().focus(id, "card");
  let attempts = 0;
  const locate = () => {
    if (useSuggestionFocus.getState().focused?.id !== id) return;
    if (scrollToSuggestionMark(id) || ++attempts >= 30) return;
    setTimeout(locate, 100);
  };
  setTimeout(locate, 0);
}
