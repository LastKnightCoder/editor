/**
 * 「转为问题」：任何入口（划线、PDF 标注、对话消息…）给出来源与默认标题，经命令面板的记问题模式
 * 收集（面板由壳层挂载，经这里的订阅点被唤起）；回车后建问题，并把来源挂成第一条材料或探究对话。
 */

import { captureQuestion, linkQuestionChat, linkQuestionTargets } from "@/commands/question";
import { isMaterialKind, type MaterialRef } from "@/entity/material";
import { resolveMaterials } from "@/services/open-material";
import type { IQuestion, QuestionLinkTarget } from "@/types";
import useSettingStore from "@/stores/useSettingStore";
import { bindDatabaseCommands } from "./command-context";

export type QuestionCaptureSource =
  | { kind: "material"; target: QuestionLinkTarget; databaseName?: string }
  | { kind: "chat"; sessionId: string; messageIds: string[] };

export interface QuestionCaptureDraft {
  source: QuestionCaptureSource;
  /** 来源 chip 的文字，如「《书名》· 划线」「对话：xxx」 */
  sourceLabel: string;
  /** 预填的问题标题（对话里的提问）；划线不预填 */
  defaultTitle?: string;
}

type Listener = (draft: QuestionCaptureDraft) => void;
const listeners = new Set<Listener>();

/** 唤起命令面板的记问题模式并带上来源；面板未挂载时什么也不做 */
export function requestQuestionCapture(draft: QuestionCaptureDraft): void {
  listeners.forEach(listener => listener(draft));
}

export function subscribeQuestionCapture(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 外部材料转为问题：来源文字取材料的出处（如「微信读书 · 《书名》 · 章节」） */
export async function requestMaterialQuestionCapture(ref: MaterialRef): Promise<void> {
  const [info] = await resolveMaterials([ref]);
  if (!info) throw new Error("来源已不存在");
  requestQuestionCapture({
    source: { kind: "material", target: { targetType: ref.kind, targetId: ref.id } },
    sourceLabel: info.meta,
  });
}

/** 来源仍可解析才建问题，避免留下没有材料的半截问题 */
async function assertSourceExists(source: QuestionCaptureSource): Promise<void> {
  if (source.kind !== "material") return;
  if (
    source.databaseName &&
    source.databaseName !== useSettingStore.getState().setting.database.active
  )
    throw new Error("数据库已切换，请重新选择来源");
  const { targetType, targetId } = source.target;
  if (!isMaterialKind(targetType)) return;
  const [info] = await resolveMaterials([{ kind: targetType, id: targetId }]);
  if (!info) throw new Error("来源已不存在");
}

export async function submitQuestionCapture(
  source: QuestionCaptureSource,
  title: string,
  groupHint: string | null
): Promise<{ question: IQuestion; groupTitle: string }> {
  const databaseName = useSettingStore.getState().setting.database.active;
  const commands = bindDatabaseCommands(
    { captureQuestion, linkQuestionTargets, linkQuestionChat },
    { databaseName }
  );
  await assertSourceExists(source);
  if (useSettingStore.getState().setting.database.active !== databaseName)
    throw new Error("数据库已切换，请重新选择来源");
  const result = await commands.captureQuestion(title, groupHint, {
    mutationSource: "question-capture",
  });
  if (source.kind === "material") {
    await commands.linkQuestionTargets(
      result.question.id,
      [source.target],
      {},
      {
        mutationSource: "question-capture",
      }
    );
  } else {
    await commands.linkQuestionChat(
      result.question.id,
      { sessionId: source.sessionId, messageIds: source.messageIds },
      { mutationSource: "question-capture" }
    );
  }
  return result;
}
