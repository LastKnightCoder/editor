/**
 * 右侧辅助栏的视图登记表：辅助栏是一个位置，登记过的视图轮流占用。
 * 视图在 features/<域>/assist/*.assist.tsx 里调用 defineAssistView，由 src/assist-views.ts 收集。
 * 打开 / 关闭经 shellStore 的 showAssist / showAssistOver / closeAssist。
 */

import type { ComponentType } from "react";

export interface AssistViewProps {
  /** 视图在辅助栏里可见（收起、被盖住、所在页隐藏时为 false，保活视图据此暂停消费请求） */
  open: boolean;
  /** 关闭本视图：有被盖住的视图就回到它 */
  onClose(): void;
  /** 本视图临时盖住的视图（如从对话里打开的网页盖住对话），供栏头放「返回」 */
  covered?: { label: string; restore(): void };
}

export interface AssistViewDefinition {
  id: string;
  /** 辅助栏的无障碍名、出错页标题、「返回」按钮上的名字 */
  label: string;
  component: ComponentType<AssistViewProps>;
  /** 关闭后仍保留挂载（对话的滚动位置与流式回答）；缺省为关闭即卸载 */
  keepAlive?: boolean;
  /** 当前页已经承载这个视图时让位（如对话页、自带对话栏的页面） */
  hiddenOn?(page: { key: string | undefined; ownsChat: boolean }): boolean;
  /** 所属功能（侧栏 key）：该功能关掉时视图不显示 */
  feature?: string;
}

const views = new Map<string, AssistViewDefinition>();

export function defineAssistView(definition: AssistViewDefinition) {
  if (views.has(definition.id) && !import.meta.env.DEV)
    throw new Error(`[assist] 重复登记视图：${definition.id}`);
  views.set(definition.id, definition);
  return definition;
}

export function getAssistView(id: string | null | undefined) {
  return id ? views.get(id) : undefined;
}
