/**
 * 预设服务商目录的渲染端读取层（M3-e）：目录在主进程、纯读不联网，这里只做
 * 「取一次缓存住」——反复开关浮层不该每次过 IPC。
 * 目录只含本运行时支持的三种线协议能跑的服务商，因此界面可以直接把结果当可选项。
 *
 * 放在 services 而非 features/settings：聊天输入框的思考档位也读它（M3-g），
 * 不属于设置页私有。
 */
import { useEffect, useState } from "react";
import { piCatalogModels, piCatalogProviders, piThinkingLevels } from "@/commands/piAi";
import type {
  LLMProviderSetting,
  PiCatalogModel,
  PiCatalogProvider,
  PiThinkingLevel,
} from "@/types/pi-llm";

let providersPromise: Promise<PiCatalogProvider[]> | null = null;
const modelsByBuiltin = new Map<string, Promise<PiCatalogModel[]>>();

export const loadCatalogProviders = (): Promise<PiCatalogProvider[]> => {
  providersPromise ??= piCatalogProviders()
    .then(result => (result.ok ? result.providers : []))
    .catch(error => {
      console.error("读取内置服务商目录失败:", error);
      return [];
    });
  return providersPromise;
};

export const loadCatalogModels = (builtin: string): Promise<PiCatalogModel[]> => {
  let pending = modelsByBuiltin.get(builtin);
  if (!pending) {
    pending = piCatalogModels(builtin)
      .then(result => (result.ok ? result.models : []))
      .catch(error => {
        console.error("读取内置模型目录失败:", error);
        return [];
      });
    modelsByBuiltin.set(builtin, pending);
  }
  return pending;
};

/** 目录未收录模型时的通用档（与主进程 GENERIC_THINKING_LEVELS 一致） */
const GENERIC_THINKING_LEVELS: PiThinkingLevel[] = ["off", "low", "medium", "high"];

/**
 * 旧本地存储里的档位值归一：早期存的是旧枚举（"none" 而非 "off"），
 * 类型收敛后统一为运行时档位（M3-g）。
 */
export const normalizeStoredThinkingLevel = (stored: string | undefined): PiThinkingLevel =>
  !stored || stored === "none" ? "off" : (stored as PiThinkingLevel);

/**
 * 某模型能选的档位：不支持推理只有「不思考」；支持则用目录给的真实档位，
 * 目录没收录该模型时退回通用档（pi 侧仍会按模型能力 clamp）。
 */
export const resolveThinkingLevelOptions = (options: {
  reasoning: boolean | undefined;
  catalogLevels: PiThinkingLevel[];
}): PiThinkingLevel[] =>
  !options.reasoning
    ? ["off"]
    : options.catalogLevels.length > 0
      ? options.catalogLevels
      : GENERIC_THINKING_LEVELS;

export { clampThinkingLevel } from "@tau/shared/chat-core";

/** 内置服务商列表（首次渲染异步填充；目录不可用时为空数组，界面退回自定义） */
export function useCatalogProviders(): { providers: PiCatalogProvider[]; loading: boolean } {
  const [providers, setProviders] = useState<PiCatalogProvider[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void loadCatalogProviders().then(list => {
      if (!alive) return;
      setProviders(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { providers, loading };
}

/** 某内置服务商的模型列表；builtin 为空（自定义服务商）时不查 */
export function useCatalogModels(builtin: string | undefined): {
  models: PiCatalogModel[];
  loading: boolean;
} {
  const [models, setModels] = useState<PiCatalogModel[]>([]);
  const [loading, setLoading] = useState(Boolean(builtin));
  useEffect(() => {
    if (!builtin) {
      setModels([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void loadCatalogModels(builtin).then(list => {
      if (!alive) return;
      setModels(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [builtin]);
  return { models, loading };
}

/**
 * 某模型真实支持的推理档位。目录未命中时返回通用档并置 fromCatalog=false，
 * 界面据此提示「目录未收录，档位可能无效」而不是假装精确。
 */
export function useThinkingLevels(
  provider: LLMProviderSetting | undefined,
  modelId: string
): { levels: PiThinkingLevel[]; fromCatalog: boolean; loading: boolean } {
  const [state, setState] = useState<{ levels: PiThinkingLevel[]; fromCatalog: boolean }>({
    levels: [],
    fromCatalog: false,
  });
  const [loading, setLoading] = useState(false);
  // provider 对象每次渲染可能是新引用：按真正影响结果的字段订阅
  const identity = provider
    ? `${provider.builtin ?? ""}\u0000${provider.baseUrl}\u0000${provider.api}`
    : "";
  const reasoning = provider?.models.find(model => model.id === modelId)?.reasoning ?? false;
  useEffect(() => {
    if (!provider || !modelId) {
      setState({ levels: [], fromCatalog: false });
      return;
    }
    let alive = true;
    setLoading(true);
    void piThinkingLevels(provider, modelId)
      .then(result => {
        if (!alive) return;
        setState({ levels: result.levels ?? [], fromCatalog: Boolean(result.fromCatalog) });
      })
      .catch(error => console.error("读取推理档位失败:", error))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, modelId, reasoning]);
  return { ...state, loading };
}
