import { invoke } from "@/electron";
import type {
  ICustomBlock,
  ICustomBlockConfig,
  ICustomBlockManifest,
  ICreateCustomBlockParams,
} from "@/types/custom-block";

// 扫描所有自定义组件
export const scanCustomBlocks = async (): Promise<ICustomBlock[]> => {
  return await invoke("custom-block:scan");
};

// 获取单个自定义组件详情
export const getCustomBlock = async (
  blockId: string,
): Promise<ICustomBlock | null> => {
  return await invoke("custom-block:get", blockId);
};

// 创建新的自定义组件
export const createCustomBlock = async (
  params: ICreateCustomBlockParams,
): Promise<ICustomBlock> => {
  return await invoke("custom-block:create", params);
};

// 更新组件源码
export const updateCustomBlockSource = async (
  blockId: string,
  source: string,
): Promise<void> => {
  return await invoke("custom-block:update-source", blockId, source);
};

// 更新组件 README
export const updateCustomBlockReadme = async (
  blockId: string,
  readme: string,
): Promise<void> => {
  return await invoke("custom-block:update-readme", blockId, readme);
};

// 更新组件 manifest
export const updateCustomBlockManifest = async (
  blockId: string,
  manifest: ICustomBlockManifest,
): Promise<void> => {
  return await invoke("custom-block:update-manifest", blockId, manifest);
};

// 删除自定义组件
export const deleteCustomBlock = async (blockId: string): Promise<void> => {
  return await invoke("custom-block:delete", blockId);
};

// 检查组件是否存在
export const checkCustomBlockExists = async (
  blockId: string,
): Promise<boolean> => {
  return await invoke("custom-block:check-exists", blockId);
};

// 获取配置
export const getCustomBlockConfig = async (): Promise<ICustomBlockConfig> => {
  return await invoke("custom-block:get-config");
};

// 更新配置
export const updateCustomBlockConfig = async (
  config: ICustomBlockConfig,
): Promise<void> => {
  return await invoke("custom-block:update-config", config);
};
