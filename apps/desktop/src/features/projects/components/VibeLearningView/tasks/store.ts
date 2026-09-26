/**
 * Vibe Learning 生成任务的运行时状态（本次运行内保留，不落库）。
 * 执行器在组件之外写入；目录、阅读区只读订阅。
 */

import { create } from "zustand";
import type { ToolCallExecutionState } from "@/types/llm";
import type { GenerateAppKey } from "../appMeta";

export type VLTaskKind = GenerateAppKey | "ppt_edit" | "report_edit";
export type VLTaskStatus = "running" | "succeeded" | "failed" | "cancelled";

/** 一轮模型调用：推理 → 工具调用 / 正文 */
export interface VLTaskTurn {
  id: string;
  reasoning: string;
  reasoningStart?: number;
  reasoningEnd?: number;
  tools: ToolCallExecutionState[];
  text: string;
}

export interface VLTask {
  id: string;
  projectId: number;
  kind: VLTaskKind;
  title: string;
  /** 落库目标：笔记类产物 / 测验集 */
  noteId?: number;
  quizSetId?: number;
  status: VLTaskStatus;
  /** 当前阶段（执行过程页顶部的一句话） */
  phase: string;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  turns: VLTaskTurn[];
  /** 最新一轮的正文（产物的流式中间态） */
  output: string;
  /** 已结束各轮的输出 token 合计 */
  outputTokens: number;
  /** 分步进度（播客合成语音） */
  progress?: { done: number; total: number };
  /** 测验：已解析出的题干 */
  quizPrompts?: string[];
  resourceNames: string[];
  userPrompt?: string;
}

interface VLTaskState {
  tasks: Record<string, VLTask>;
  /** 每个项目的产物版本：任务落库后 +1，页面据此刷新列表 */
  productVersion: Record<number, number>;
  put: (task: VLTask) => void;
  patch: (id: string, patch: Partial<VLTask> | ((task: VLTask) => Partial<VLTask>)) => void;
  bumpProducts: (projectId: number) => void;
  remove: (id: string) => void;
}

export const useVLTaskStore = create<VLTaskState>(set => ({
  tasks: {},
  productVersion: {},
  put: task => set(s => ({ tasks: { ...s.tasks, [task.id]: task } })),
  patch: (id, patch) =>
    set(s => {
      const task = s.tasks[id];
      if (!task) return s;
      const next = typeof patch === "function" ? patch(task) : patch;
      return { tasks: { ...s.tasks, [id]: { ...task, ...next } } };
    }),
  bumpProducts: projectId =>
    set(s => ({
      productVersion: { ...s.productVersion, [projectId]: (s.productVersion[projectId] ?? 0) + 1 },
    })),
  remove: id =>
    set(s => {
      const next = { ...s.tasks };
      delete next[id];
      return { tasks: next };
    }),
}));

/** 某个产物最近的一次任务（同一篇可能先生成、后 AI 编辑） */
function latest(tasks: Record<string, VLTask>, match: (t: VLTask) => boolean) {
  let found: VLTask | undefined;
  for (const task of Object.values(tasks)) {
    if (match(task) && (!found || task.startedAt > found.startedAt)) found = task;
  }
  return found;
}

export const useNoteTask = (noteId: number | null | undefined) =>
  useVLTaskStore(s => (noteId ? latest(s.tasks, t => t.noteId === noteId) : undefined));

export const useQuizTask = (quizSetId: number | null | undefined) =>
  useVLTaskStore(s => (quizSetId ? latest(s.tasks, t => t.quizSetId === quizSetId) : undefined));

export const isTaskActive = (task: VLTask | undefined) => task?.status === "running";
