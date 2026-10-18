import type { ComponentType } from "react";
import type { Disposable, PluginContext } from "./index";
import type { JsonValue } from "./json";

export interface PluginSettingsProps {
  readonly context: PluginContext;
  readonly syncConfig?: {
    readonly value: JsonValue;
    save(value: JsonValue): Promise<void>;
  };
}

export interface PluginSettingsDefinition {
  id: string;
  title: string;
  description?: string;
  /** 同步提供方的配置表单挂载到宿主同步设置。 */
  target?: "sync";
  component: ComponentType<PluginSettingsProps>;
}

export interface PluginSettingsHandle extends Disposable {
  readonly id: string;
  open(): Promise<void>;
}

export interface PluginSettings {
  /** 分区随本次激活回收，保存使用 context.storage。 */
  register(definition: PluginSettingsDefinition): PluginSettingsHandle;
}
