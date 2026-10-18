import type { ComponentType } from "react";
import type { Disposable, PluginContext } from "./index";
import type { JsonValue } from "./json";

export interface PluginSettingsProps {
  readonly context: PluginContext;
  readonly uploadConfig?: {
    readonly value: JsonValue;
    save(value: JsonValue): Promise<void>;
  };
  readonly syncConfig?: {
    readonly value: JsonValue;
    save(value: JsonValue): Promise<void>;
  };
}

export interface PluginSettingsDefinition {
  id: string;
  title: string;
  description?: string;
  /** 提供方配置表单挂载到对应宿主设置；普通插件设置省略。 */
  target?: "sync" | "upload";
  component: ComponentType<PluginSettingsProps>;
}

export interface PluginSettingsHandle extends Disposable {
  readonly id: string;
  open(): Promise<void>;
}

export interface PluginSettings {
  /** 分区随本次激活回收；提供方保存使用配置属性，普通设置使用 context.storage。 */
  register(definition: PluginSettingsDefinition): PluginSettingsHandle;
}
