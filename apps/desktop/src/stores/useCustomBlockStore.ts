import { create } from "zustand";
import type { ICustomBlock, ICustomBlockConfig } from "@/types/custom-block";
import {
  scanCustomBlocks,
  getCustomBlock,
  getCustomBlockConfig,
  updateCustomBlockConfig,
} from "@/commands/custom-block";

interface CustomBlockState {
  // 所有自定义组件列表
  blocks: ICustomBlock[];
  // 加载状态
  loading: boolean;
  // 错误信息
  error: string | null;
  // 配置
  config: ICustomBlockConfig;
}

interface CustomBlockActions {
  // 加载所有组件
  loadBlocks: () => Promise<void>;
  // 重新加载组件
  refresh: () => Promise<void>;
  // 获取单个组件
  getBlock: (blockId: string) => Promise<ICustomBlock | null>;
  // 切换组件启用状态
  toggleBlockEnabled: (blockId: string) => Promise<void>;
  // 获取已启用的组件
  getEnabledBlocks: () => ICustomBlock[];
  // 更新本地组件缓存
  updateBlockInCache: (block: ICustomBlock) => void;
  // 从缓存中删除组件
  removeBlockFromCache: (blockId: string) => void;
}

const useCustomBlockStore = create<CustomBlockState & CustomBlockActions>(
  (set, get) => ({
    // 初始状态
    blocks: [],
    loading: false,
    error: null,
    config: { blocks: {} },

    // 加载所有组件
    loadBlocks: async () => {
      set({ loading: true, error: null });
      try {
        const [blocks, config] = await Promise.all([
          scanCustomBlocks(),
          getCustomBlockConfig(),
        ]);
        set({ blocks, config, loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "加载组件失败",
          loading: false,
        });
      }
    },

    // 重新加载组件
    refresh: async () => {
      await get().loadBlocks();
    },

    // 获取单个组件
    getBlock: async (blockId: string) => {
      try {
        const block = await getCustomBlock(blockId);
        if (block) {
          // 更新缓存
          get().updateBlockInCache(block);
        }
        return block;
      } catch (error) {
        console.error("Failed to get block:", error);
        return null;
      }
    },

    // 切换组件启用状态
    toggleBlockEnabled: async (blockId: string) => {
      const { config, blocks } = get();
      const blockConfig = config.blocks[blockId];

      if (!blockConfig) {
        console.error(`Block ${blockId} not found in config`);
        return;
      }

      // 更新配置
      const newConfig: ICustomBlockConfig = {
        ...config,
        blocks: {
          ...config.blocks,
          [blockId]: {
            ...blockConfig,
            enabled: !blockConfig.enabled,
          },
        },
      };

      try {
        await updateCustomBlockConfig(newConfig);

        // 更新本地状态
        set({
          config: newConfig,
          blocks: blocks.map((block) =>
            block.id === blockId
              ? { ...block, enabled: !block.enabled }
              : block,
          ),
        });
      } catch (error) {
        console.error("Failed to toggle block enabled:", error);
        set({
          error: error instanceof Error ? error.message : "更新配置失败",
        });
      }
    },

    // 获取已启用的组件
    getEnabledBlocks: () => {
      return get().blocks.filter((block) => block.enabled);
    },

    // 更新本地组件缓存
    updateBlockInCache: (updatedBlock: ICustomBlock) => {
      set((state) => ({
        blocks: state.blocks.map((block) =>
          block.id === updatedBlock.id ? updatedBlock : block,
        ),
      }));
    },

    // 从缓存中删除组件
    removeBlockFromCache: (blockId: string) => {
      set((state) => ({
        blocks: state.blocks.filter((block) => block.id !== blockId),
      }));
    },
  }),
);

export default useCustomBlockStore;
