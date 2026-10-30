import { listCatalogModels, listCatalogProviders } from "@tau/ai/catalog";
import type { PiCatalogModel, PiCatalogProvider } from "@tau/ai/models";
import type { MobileLlmProvider } from "../../../types";

/** 添加服务商时排在前面的预设，其余收进「更多」 */
const FEATURED = [
  "deepseek",
  "moonshotai-cn",
  "zai-coding-cn",
  "minimax-cn",
  "openrouter",
  "anthropic",
  "openai",
];

const DISPLAY_NAMES: Record<string, string> = {
  deepseek: "DeepSeek",
  "moonshotai-cn": "Kimi · 月之暗面",
  moonshotai: "Kimi（国际）",
  "zai-coding-cn": "智谱 GLM",
  zai: "智谱 GLM（国际）",
  "minimax-cn": "MiniMax",
  minimax: "MiniMax（国际）",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
  groq: "Groq",
};

export const catalogName = (provider: Pick<PiCatalogProvider, "id" | "name">) =>
  DISPLAY_NAMES[provider.id] ?? provider.name;

let cached: { featured: PiCatalogProvider[]; others: PiCatalogProvider[] } | null = null;

/** 只列有官方地址的服务商：网关类需要账号占位符，走「自定义」 */
export function catalogPresets() {
  if (!cached) {
    const all = listCatalogProviders().filter(provider => provider.baseUrl);
    const featured = FEATURED.flatMap(id => all.filter(provider => provider.id === id));
    const others = all
      .filter(provider => !FEATURED.includes(provider.id))
      .sort((a, b) => catalogName(a).localeCompare(catalogName(b)));
    cached = { featured, others };
  }
  return cached;
}

export const catalogModels = (builtin: string | undefined): PiCatalogModel[] =>
  builtin ? listCatalogModels(builtin) : [];

/** 目录模型 → 设置项：容量由目录给出，设置里只记 id、名称、能力与协议 */
export function modelFromCatalog(model: PiCatalogModel): MobileLlmProvider["models"][number] {
  return {
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    input: model.input,
    api: model.api,
  };
}

export const CUSTOM_PRESET = "custom";

/** 详情页草稿：预设默认勾选目录前两个模型；自定义留空待手填 */
export function draftProvider(presetId: string, id: string): MobileLlmProvider | null {
  if (presetId === CUSTOM_PRESET)
    return { id, name: "", baseUrl: "", api: "openai-completions", models: [] };
  const preset = listCatalogProviders().find(item => item.id === presetId && item.baseUrl);
  if (!preset) return null;
  return {
    id,
    name: catalogName(preset),
    baseUrl: preset.baseUrl ?? "",
    api: preset.api,
    builtin: preset.id,
    models: catalogModels(preset.id).slice(0, 2).map(modelFromCatalog),
  };
}
