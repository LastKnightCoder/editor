import type { ComponentType } from "react";
import type { Disposable, PluginContext } from "./contract";
import type { PluginIcon } from "./icons";
import type { JsonValue } from "./json";
import type { PluginOwnEntity } from "./entities";

/**
 * Notebook 输出：插件在 Notebook 的「生成」菜单里加一种产物。对话框、资料勾选、AI 生成与执行过程页
 * 都由 Tau 负责，AI 走 Notebook 已有的生成流程与资料检索；插件只说明要什么（prepare），
 * 拿到生成的正文后自己处理（complete）。
 */

/** 用户勾选的一份资料（只有名称，插件读不到资料内容） */
export interface PluginNotebookOutputResource {
  id: string;
  name: string;
}

export interface PluginNotebookOutputTarget {
  notebook: { id: string; title: string };
  resources: readonly PluginNotebookOutputResource[];
}

/** 插件在对话框中间放的选项区：value 由插件定义，宿主原样保存并在 prepare 时交回 */
export interface PluginNotebookOutputOptionsProps {
  readonly context: PluginContext;
  readonly target: PluginNotebookOutputTarget;
  readonly value: JsonValue | undefined;
  onChange(value: JsonValue): void;
  /** 传入原因时「开始生成」不可用，并在对话框底部显示原因；null 解除 */
  setBlocker(reason: string | null): void;
}

export interface PluginNotebookOutputPrepareInput extends PluginNotebookOutputTarget {
  /** 用户在「额外要求」里写的话，可能为空 */
  userPrompt: string;
  options: JsonValue | undefined;
  signal: AbortSignal;
}

/** 交给 AI 的任务说明；资料清单、检索工具与通用生成规则由 Tau 补上 */
export interface PluginNotebookOutputPlan {
  /** 这一次产物的插件实体 ID（插件先建好占位），类型须为 registerOutput 声明的 kind */
  entity: string;
  /** 执行过程页显示的标题 */
  title: string;
  /** 任务要求与输出格式：写什么、怎么写、最终只输出什么 */
  instructions: string;
  /** 补充提醒，按条列出 */
  reminders?: readonly string[];
}

/** complete 期间向执行过程页报告进度 */
export interface PluginNotebookOutputTask {
  /** 当前阶段的一句话，如「合成语音」 */
  phase(text: string): void;
  /** 分步进度；total 为 0 时不显示进度条 */
  progress(done: number, total: number): void;
}

export interface PluginNotebookOutputCompleteInput {
  entity: string;
  /** AI 最终输出的正文 */
  text: string;
  task: PluginNotebookOutputTask;
  signal: AbortSignal;
}

export interface PluginNotebookOutputFailInput {
  entity: string;
  /** cancelled：用户停止；failed：生成或 complete 出错 */
  reason: "cancelled" | "failed";
  message: string;
}

/** 产物在 Notebook 阅读区里的显示 */
export interface PluginNotebookOutputViewProps {
  readonly context: PluginContext;
  readonly entity: PluginOwnEntity;
  readonly notebook: { id: string; title: string };
}

export interface PluginNotebookOutputDefinition {
  /** 插件内唯一 */
  id: string;
  /** 菜单与执行过程页里的名称，如「播客」 */
  title: string;
  icon?: PluginIcon;
  /** 一句话说明，显示在对话框标题下 */
  description?: string;
  /** 产物对应的插件实体类型（须先 entities.registerKind） */
  kind: string;
  options?: ComponentType<PluginNotebookOutputOptionsProps>;
  view: ComponentType<PluginNotebookOutputViewProps>;
  prepare(input: PluginNotebookOutputPrepareInput): Promise<PluginNotebookOutputPlan>;
  complete(input: PluginNotebookOutputCompleteInput): Promise<void>;
  /** 生成失败、complete 抛错或用户停止时调用；插件据此清理占位或标为失败 */
  fail?(input: PluginNotebookOutputFailInput): Promise<void> | void;
}

export interface PluginNotebooks {
  /** 只在主窗口的 Notebook 里出现；目前只有桌面支持 */
  registerOutput(definition: PluginNotebookOutputDefinition): Disposable;
}
