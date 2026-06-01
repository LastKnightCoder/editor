import {
  webClipTaskRunner,
  type WebClipCompleteData,
  type WebClipErrorData,
  type WebClipProgressData,
  type WebClipStartParams,
  type WebClipStatusResult,
} from "./webClipTaskRunner";

export type {
  WebClipCompleteData,
  WebClipErrorData,
  WebClipProgressData,
  WebClipStartParams,
  WebClipStatusResult,
};

/**
 * 开始解析网页
 */
export const startWebClip = async (params: WebClipStartParams) => {
  return webClipTaskRunner.start(params);
};

/**
 * 取消解析
 */
export const cancelWebClip = async (projectItemId: number) => {
  return webClipTaskRunner.cancel(projectItemId);
};

/**
 * 获取解析状态
 */
export const getWebClipStatus = async (
  projectItemId: number,
): Promise<WebClipStatusResult | null> => {
  return webClipTaskRunner.getStatus(projectItemId);
};

/**
 * 注册进度监听器
 */
export const registerWebClipProgressHandler = (
  handler: (data: WebClipProgressData) => void,
) => {
  return webClipTaskRunner.onProgress(handler);
};

/**
 * 注册完成监听器
 */
export const registerWebClipCompleteHandler = (
  handler: (data: WebClipCompleteData) => void,
) => {
  return webClipTaskRunner.onComplete(handler);
};

/**
 * 注册错误监听器
 */
export const registerWebClipErrorHandler = (
  handler: (data: WebClipErrorData) => void,
) => {
  return webClipTaskRunner.onError(handler);
};
