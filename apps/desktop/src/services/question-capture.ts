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
  | { kind: "chat"; sessionId: string; messageIds: string[] }
  /** 主题层的发现涉及几份笔记（缺一环、同一思路、矛盾两端）：都挂成材料 */
  | { kind: "materials"; targets: QuestionLinkTarget[]; databaseName?: string }
  /** 问了但没写：问过的几次分在不同会话里，各挂成一段探究对话 */
  | { kind: "chats"; chats: Array<{ sessionId: string; messageIds: string[] }> }
  /** 只有主题、没有具体来源（主题里还缺的那一块）：面板里显示来源文字，建问题时不挂材料 */
  | { kind: "none" };

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
  if (source.kind !== "material" && source.kind !== "materials") return;
  if (
    source.databaseName &&
    source.databaseName !== useSettingStore.getState().setting.database.active
  )
    throw new Error("数据库已切换，请重新选择来源");
  const targets = source.kind === "material" ? [source.target] : source.targets;
  const materials = targets.flatMap(({ targetType, targetId }) =>
    isMaterialKind(targetType) ? [{ kind: targetType, id: targetId }] : []
  );
  if (!materials.length) return;
  const infos = await resolveMaterials(materials);
  if (infos.filter(Boolean).length < materials.length) throw new Error("来源已不存在");
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
  const options = { mutationSource: "question-capture" } as const;
  if (source.kind === "material" || source.kind === "materials") {
    const targets = source.kind === "material" ? [source.target] : source.targets;
    if (targets.length)
      await commands.linkQuestionTargets(result.question.id, targets, {}, options);
  } else if (source.kind === "chat" || source.kind === "chats") {
    const chats =
      source.kind === "chat"
        ? [{ sessionId: source.sessionId, messageIds: source.messageIds }]
        : source.chats;
    for (const chat of chats) await commands.linkQuestionChat(result.question.id, chat, options);
  }
  return result;
}
