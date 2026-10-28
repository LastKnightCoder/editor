import type { JsonValue } from "@tau/plugins";

export type EmbeddingProviderKind = "local" | "plugin";
export type EmbeddingDevicePolicy = "auto" | "cpu" | "cuda";

export interface EmbeddingActiveModel {
  provider: EmbeddingProviderKind;
  /** provider === "plugin" 时必填 */
  pluginId?: string;
  /** 本地为注册表模型名（如 "bge-m3"），插件为插件模型 id */
  model: string;
  /** 激活时冻结 */
  dimensions: number;
}

export interface EmbeddingSetting {
  /** 默认 null；只有用户「设为当前」确认后写入 */
  active: EmbeddingActiveModel | null;
  local: {
    source: "modelscope" | "huggingface";
    devicePolicy: EmbeddingDevicePolicy;
    batchSize: number;
  };
  /** 按插件 ID 存连接配置（插件嵌入提供方由后续步骤接入） */
  plugins: Record<string, { config: JsonValue }>;
}
