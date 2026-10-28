import type { ComponentType } from "react";
import type { Disposable, PluginContext } from "./index";
import type { JsonValue } from "./json";
import type { ProviderForm } from "./provider-form";

export interface PluginSettingsProps {
  readonly context: PluginContext;
  readonly publishConfig?: {
    readonly value: JsonValue;
    save(value: JsonValue): Promise<void>;
  };
  readonly imageConfig?: {
    readonly instanceId: string;
    readonly value: JsonValue;
    readonly modelId: string;
    save(value: JsonValue, modelId: string): Promise<void>;
  };
  readonly asrConfig?: {
    readonly value: JsonValue;
    readonly modelId: string;
    save(value: JsonValue, modelId: string): Promise<void>;
  };
  readonly ttsConfig?: {
    readonly instanceId: string;
    readonly value: JsonValue;
    readonly models: readonly { id: string; label?: string }[];
    save(value: JsonValue, models: readonly { id: string; label?: string }[]): Promise<void>;
  };
  readonly videoConfig?: {
    readonly value: JsonValue;
    save(value: JsonValue): Promise<void>;
  };
}

interface PluginSettingsBase {
  id: string;
  title: string;
  description?: string;
  /** 提供方可用的模型目录；账号已保存的模型优先于此初始目录。 */
  models?: readonly PluginSettingsModel[];
}

export interface PluginSettingsModel {
  id: string;
  label?: string;
  /** 嵌入模型的向量维度；仅作展示提示，实际以 embed 返回为准。 */
  dimensions?: number;
}

/** 提供方的连接配置：只声明字段，由宿主在插件设置页按平台渲染与保存。 */
export interface PluginProviderSettingsDefinition extends PluginSettingsBase {
  target: "sync" | "upload" | "tts" | "asr" | "images" | "embeddings" | "video" | "publish";
  form: ProviderForm;
  component?: never;
}

export interface PluginComponentSettingsDefinition extends PluginSettingsBase {
  /** 特殊交互在插件页承载；普通插件设置省略。 */
  target?: "tts" | "asr" | "images" | "video" | "publish";
  component: ComponentType<PluginSettingsProps>;
  form?: never;
}

export type PluginSettingsDefinition =
  | PluginProviderSettingsDefinition
  | PluginComponentSettingsDefinition;

export interface PluginSettingsHandle extends Disposable {
  readonly id: string;
  open(): Promise<void>;
}

export interface PluginSettings {
  /** 分区随本次激活回收；提供方保存使用配置属性，普通设置使用 context.storage。 */
  register(definition: PluginSettingsDefinition): PluginSettingsHandle;
}
