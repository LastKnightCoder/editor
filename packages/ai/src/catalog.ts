/**
 * pi 内置模型目录的只读视图：只暴露本项目支持的三种线协议，纯同步、无 Node 依赖，
 * 桌面主进程与移动端共用其中的过滤与转换逻辑。
 */

import { getSupportedThinkingLevels, type Api, type Model } from "@earendil-works/pi-ai";
import {
  getBuiltinModels,
  getBuiltinProviders,
  type BuiltinProvider,
} from "@earendil-works/pi-ai/providers/all";
import type { PiApiKind, PiCatalogModel, PiCatalogProvider, PiThinkingLevel } from "./models";

/** 本项目支持的线协议：目录里另有 bedrock/google/vertex 等协议本运行时跑不起来，一律不暴露 */
const SUPPORTED_APIS = new Set<string>([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
]);

export const isSupportedModel = (model: Model<Api>): boolean => SUPPORTED_APIS.has(model.api);

/** 目录模型 → 设置页形状（含真实推理档位；不支持推理时为空数组） */
export function toCatalogModel(model: Model<Api>): PiCatalogModel {
  const levels = model.reasoning
    ? (getSupportedThinkingLevels(model) as PiThinkingLevel[])
    : ([] as PiThinkingLevel[]);
  return {
    id: model.id,
    name: model.name ?? model.id,
    api: model.api as PiApiKind,
    reasoning: model.reasoning,
    input: (model.input ?? ["text"]).filter(
      (kind): kind is "text" | "image" => kind === "text" || kind === "image"
    ),
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    ...(model.cost && (model.cost.input || model.cost.output)
      ? {
          cost: {
            input: model.cost.input,
            output: model.cost.output,
            cacheRead: model.cost.cacheRead,
            cacheWrite: model.cost.cacheWrite,
          },
        }
      : {}),
    thinkingLevels: levels,
  };
}

const supportedModelsOf = (id: string): Model<Api>[] =>
  getBuiltinProviders().includes(id as BuiltinProvider)
    ? (getBuiltinModels(id as BuiltinProvider) as Model<Api>[]).filter(isSupportedModel)
    : [];

/**
 * 内置服务商目录（只列有受支持模型的服务商）。服务商级 api 取其模型里占多数的那种，
 * 仅作手填模型的兜底；baseUrl 含 `{占位符}` 的网关类服务商需用户自填，故省略。
 */
export function listCatalogProviders(): PiCatalogProvider[] {
  const providers: PiCatalogProvider[] = [];
  for (const id of getBuiltinProviders()) {
    const models = supportedModelsOf(id);
    if (models.length === 0) continue;
    const tally = new Map<string, number>();
    for (const model of models) tally.set(model.api, (tally.get(model.api) ?? 0) + 1);
    const [dominant] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const baseUrl = models[0].baseUrl;
    providers.push({
      id,
      name: id,
      ...(baseUrl && !baseUrl.includes("{") ? { baseUrl } : {}),
      api: dominant[0] as PiApiKind,
      modelCount: models.length,
    });
  }
  return providers.sort((a, b) => a.name.localeCompare(b.name));
}

/** 某内置服务商下受支持的模型（按展示名排序，供设置页勾选） */
export function listCatalogModels(builtinId: string): PiCatalogModel[] {
  return supportedModelsOf(builtinId)
    .map(toCatalogModel)
    .sort((a, b) => a.name.localeCompare(b.name));
}
