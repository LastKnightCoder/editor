import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useSettingStore from "@/stores/useSettingStore";

export interface WebClipStartParams {
  projectItemId: number;
  html: string;
  url: string;
  title: string;
  translateToChinese?: boolean;
}

export interface WebClipProgressData {
  projectItemId: number;
  markdown: string;
  delta: string;
}

export interface WebClipCompleteData {
  projectItemId: number;
  markdown: string;
  url: string;
  title: string;
  webClipId?: number;
  contentId?: number;
}

export interface WebClipErrorData {
  projectItemId: number;
  error: string;
}

export interface WebClipStatusResult {
  projectItemId: number;
  status: "processing" | "completed" | "error" | "cancelled";
  markdown: string;
}

/**
 * 开始解析网页
 */
export const startWebClip = async (params: WebClipStartParams) => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client) {
    throw new Error("WebSocket client not initialized");
  }

  // 获取 LLM 配置
  const { llmConfigs, llmUsageSettings } = useSettingStore.getState().setting;
  const usageConfig = llmUsageSettings.webClip;

  if (!usageConfig) {
    throw new Error("webClip 功能未配置 LLM");
  }

  const providerConfig = llmConfigs.find(
    (config) => config.id === usageConfig.providerId,
  );
  if (!providerConfig) {
    throw new Error("找不到 webClip 功能的 provider 配置");
  }

  const modelConfig = providerConfig.models?.find(
    (model) => model.name === usageConfig.modelName,
  );
  if (!modelConfig) {
    throw new Error("找不到 webClip 功能的 model 配置");
  }

  return client.sendRequest("web-clip:start", {
    ...params,
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    modelName: modelConfig.name,
  });
};

/**
 * 取消解析
 */
export const cancelWebClip = async (projectItemId: number) => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client) {
    throw new Error("WebSocket client not initialized");
  }

  return client.sendRequest("web-clip:cancel", { projectItemId });
};

/**
 * 获取解析状态
 */
export const getWebClipStatus = async (
  projectItemId: number,
): Promise<WebClipStatusResult | null> => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client) {
    throw new Error("WebSocket client not initialized");
  }

  return (await client.sendRequest("web-clip:status", {
    projectItemId,
  })) as WebClipStatusResult | null;
};

/**
 * 注册进度监听器
 */
export const registerWebClipProgressHandler = (
  handler: (data: WebClipProgressData) => void,
) => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client) {
    console.warn("WebSocket client not initialized");
    return () => {};
  }

  client.registerNotificationHandler(
    "web-clip:progress",
    handler as (data: unknown) => void,
  );

  return () => {
    client.unregisterNotificationHandler(
      "web-clip:progress",
      handler as (data: unknown) => void,
    );
  };
};

/**
 * 注册完成监听器
 */
export const registerWebClipCompleteHandler = (
  handler: (data: WebClipCompleteData) => void,
) => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client) {
    console.warn("WebSocket client not initialized");
    return () => {};
  }

  client.registerNotificationHandler(
    "web-clip:complete",
    handler as (data: unknown) => void,
  );

  return () => {
    client.unregisterNotificationHandler(
      "web-clip:complete",
      handler as (data: unknown) => void,
    );
  };
};

/**
 * 注册错误监听器
 */
export const registerWebClipErrorHandler = (
  handler: (data: WebClipErrorData) => void,
) => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client) {
    console.warn("WebSocket client not initialized");
    return () => {};
  }

  client.registerNotificationHandler(
    "web-clip:error",
    handler as (data: unknown) => void,
  );

  return () => {
    client.unregisterNotificationHandler(
      "web-clip:error",
      handler as (data: unknown) => void,
    );
  };
};
