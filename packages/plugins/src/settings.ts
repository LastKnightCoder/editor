import type { ComponentType } from "react";
import type { Disposable, PluginContext } from "./index";

export interface PluginSettingsProps {
  readonly context: PluginContext;
}

export interface PluginSettingsDefinition {
  id: string;
  title: string;
  description?: string;
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
