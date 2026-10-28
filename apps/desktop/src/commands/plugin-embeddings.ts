import type { JsonValue } from "@tau/plugins";
import { invoke } from "@/electron";
import { withModule } from "./module-init";

export const savePluginEmbeddingConfig = (pluginId: string, config: JsonValue): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:embeddings-config", pluginId, config));
