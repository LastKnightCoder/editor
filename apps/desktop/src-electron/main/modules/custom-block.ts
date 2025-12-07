import { ipcMain } from "electron";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";
import { Module } from "../types/module";

// 默认组件模板
const DEFAULT_COMPONENT_TEMPLATE = (name: string) => `const Component = () => {
  const { antd } = components;
  const { Button } = antd;

  return (
    <div>
      <h2>${name}</h2>
      <p>这是一个自定义组件模板</p>
      <Button type="primary">点击按钮</Button>
    </div>
  );
};
`;

// 默认 README 模板
const DEFAULT_README_TEMPLATE = (
  name: string,
  author: string,
  description: string,
) => `# ${name}

## 作者
${author}

## 描述
${description}

## 使用方法
在这里描述如何使用这个组件...
`;

interface ICustomBlockManifest {
  name: string;
  author: string;
  description: string;
}

interface ICustomBlock {
  id: string;
  manifest: ICustomBlockManifest;
  source: string;
  readme: string;
  path: string;
  enabled: boolean;
  isLocal: boolean;
  createTime?: number;
  updateTime?: number;
}

interface ICustomBlockConfig {
  blocks: {
    [blockId: string]: {
      enabled: boolean;
      isLocal: boolean;
      createTime?: number;
      updateTime?: number;
    };
  };
}

interface ICreateCustomBlockParams {
  id: string;
  name: string;
  author: string;
  description: string;
}

class CustomBlockModule implements Module {
  name = "custom-block";
  private customBlocksDir = "";
  private configPath = "";

  async init() {
    const appDir = PathUtil.getAppDir();
    this.customBlocksDir = join(appDir, "custom-blocks");
    this.configPath = join(appDir, "custom-block-config.json");

    // 确保目录存在
    await this.ensureDirectories();

    // 启动时检查和修复组件文件
    await this.checkAndRepairComponents();

    // 注册 IPC 接口
    ipcMain.handle("custom-block:scan", async () => {
      return await this.scanCustomBlocks();
    });

    ipcMain.handle("custom-block:get", async (_, blockId: string) => {
      return await this.getCustomBlock(blockId);
    });

    ipcMain.handle(
      "custom-block:create",
      async (_, params: ICreateCustomBlockParams) => {
        return await this.createCustomBlock(params);
      },
    );

    ipcMain.handle(
      "custom-block:update-source",
      async (_, blockId: string, source: string) => {
        return await this.updateSource(blockId, source);
      },
    );

    ipcMain.handle(
      "custom-block:update-readme",
      async (_, blockId: string, readme: string) => {
        return await this.updateReadme(blockId, readme);
      },
    );

    ipcMain.handle(
      "custom-block:update-manifest",
      async (_, blockId: string, manifest: ICustomBlockManifest) => {
        return await this.updateManifest(blockId, manifest);
      },
    );

    ipcMain.handle("custom-block:delete", async (_, blockId: string) => {
      return await this.deleteCustomBlock(blockId);
    });

    ipcMain.handle("custom-block:check-exists", async (_, blockId: string) => {
      return await this.checkExists(blockId);
    });

    ipcMain.handle("custom-block:get-config", async () => {
      return await this.getConfig();
    });

    ipcMain.handle(
      "custom-block:update-config",
      async (_, config: ICustomBlockConfig) => {
        return await this.updateConfig(config);
      },
    );

    log.info("CustomBlock module initialized");
  }

  // 确保必要的目录存在
  private async ensureDirectories() {
    try {
      if (!existsSync(this.customBlocksDir)) {
        await fs.mkdir(this.customBlocksDir, { recursive: true });
        log.info(`Created custom blocks directory: ${this.customBlocksDir}`);
      }

      // 确保配置文件存在
      if (!existsSync(this.configPath)) {
        const defaultConfig: ICustomBlockConfig = { blocks: {} };
        await fs.writeFile(
          this.configPath,
          JSON.stringify(defaultConfig, null, 2),
          "utf-8",
        );
        log.info(`Created config file: ${this.configPath}`);
      }
    } catch (error) {
      log.error("Failed to ensure directories:", error);
      throw error;
    }
  }

  // 扫描所有自定义组件
  private async scanCustomBlocks(): Promise<ICustomBlock[]> {
    try {
      const entries = await fs.readdir(this.customBlocksDir, {
        withFileTypes: true,
      });
      const config = await this.getConfig();
      const blocks: ICustomBlock[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const block = await this.loadCustomBlock(entry.name, config);
            if (block) {
              blocks.push(block);
            }
          } catch (error) {
            log.error(`Failed to load custom block ${entry.name}:`, error);
          }
        }
      }

      return blocks;
    } catch (error) {
      log.error("Failed to scan custom blocks:", error);
      return [];
    }
  }

  // 加载单个自定义组件
  private async loadCustomBlock(
    blockId: string,
    config: ICustomBlockConfig,
  ): Promise<ICustomBlock | null> {
    const blockPath = join(this.customBlocksDir, blockId);
    const manifestPath = join(blockPath, "manifest.json");
    const sourcePath = join(blockPath, "Component.tsx");
    const readmePath = join(blockPath, "README.md");

    try {
      // 检查必要文件是否存在
      if (
        !existsSync(manifestPath) ||
        !existsSync(sourcePath) ||
        !existsSync(readmePath)
      ) {
        log.warn(`Custom block ${blockId} is missing required files`);
        return null;
      }

      // 读取文件内容
      const manifestContent = await fs.readFile(manifestPath, "utf-8");
      const manifest: ICustomBlockManifest = JSON.parse(manifestContent);
      const source = await fs.readFile(sourcePath, "utf-8");
      const readme = await fs.readFile(readmePath, "utf-8");

      // 从配置中获取状态
      const blockConfig = config.blocks[blockId] || {
        enabled: true,
        isLocal: false,
      };

      return {
        id: blockId,
        manifest,
        source,
        readme,
        path: blockPath,
        enabled: blockConfig.enabled,
        isLocal: blockConfig.isLocal,
        createTime: blockConfig.createTime,
        updateTime: blockConfig.updateTime,
      };
    } catch (error) {
      log.error(`Failed to load custom block ${blockId}:`, error);
      return null;
    }
  }

  // 获取单个自定义组件
  private async getCustomBlock(blockId: string): Promise<ICustomBlock | null> {
    const config = await this.getConfig();
    return await this.loadCustomBlock(blockId, config);
  }

  // 创建新的自定义组件
  private async createCustomBlock(
    params: ICreateCustomBlockParams,
  ): Promise<ICustomBlock> {
    const { id, name, author, description } = params;
    const blockPath = join(this.customBlocksDir, id);

    // 检查是否已存在
    if (existsSync(blockPath)) {
      throw new Error(`Custom block with id "${id}" already exists`);
    }

    try {
      // 创建文件夹
      await fs.mkdir(blockPath, { recursive: true });

      // 创建 manifest.json
      const manifest: ICustomBlockManifest = { name, author, description };
      await fs.writeFile(
        join(blockPath, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf-8",
      );

      // 创建 Component.tsx 使用默认模板
      await fs.writeFile(
        join(blockPath, "Component.tsx"),
        DEFAULT_COMPONENT_TEMPLATE(name),
        "utf-8",
      );

      // 创建 README.md 使用默认模板
      await fs.writeFile(
        join(blockPath, "README.md"),
        DEFAULT_README_TEMPLATE(name, author, description),
        "utf-8",
      );

      // 更新配置
      const config = await this.getConfig();
      const now = Date.now();
      config.blocks[id] = {
        enabled: true,
        isLocal: true,
        createTime: now,
        updateTime: now,
      };
      await this.updateConfig(config);

      log.info(`Created custom block: ${id}`);

      // 返回创建的组件
      const block = await this.getCustomBlock(id);
      if (!block) {
        throw new Error("Failed to load created custom block");
      }
      return block;
    } catch (error) {
      // 清理已创建的文件
      if (existsSync(blockPath)) {
        await fs.rm(blockPath, { recursive: true, force: true });
      }
      log.error(`Failed to create custom block ${id}:`, error);
      throw error;
    }
  }

  // 更新组件源码
  private async updateSource(blockId: string, source: string): Promise<void> {
    const blockPath = join(this.customBlocksDir, blockId);
    const sourcePath = join(blockPath, "Component.tsx");

    if (!existsSync(blockPath)) {
      throw new Error(`Custom block "${blockId}" not found`);
    }

    await fs.writeFile(sourcePath, source, "utf-8");

    // 更新时间
    const config = await this.getConfig();
    if (config.blocks[blockId]) {
      config.blocks[blockId].updateTime = Date.now();
      await this.updateConfig(config);
    }

    log.info(`Updated source for custom block: ${blockId}`);
  }

  // 更新 README
  private async updateReadme(blockId: string, readme: string): Promise<void> {
    const blockPath = join(this.customBlocksDir, blockId);
    const readmePath = join(blockPath, "README.md");

    if (!existsSync(blockPath)) {
      throw new Error(`Custom block "${blockId}" not found`);
    }

    await fs.writeFile(readmePath, readme, "utf-8");

    // 更新时间
    const config = await this.getConfig();
    if (config.blocks[blockId]) {
      config.blocks[blockId].updateTime = Date.now();
      await this.updateConfig(config);
    }

    log.info(`Updated README for custom block: ${blockId}`);
  }

  // 更新 manifest
  private async updateManifest(
    blockId: string,
    manifest: ICustomBlockManifest,
  ): Promise<void> {
    const blockPath = join(this.customBlocksDir, blockId);
    const manifestPath = join(blockPath, "manifest.json");

    if (!existsSync(blockPath)) {
      throw new Error(`Custom block "${blockId}" not found`);
    }

    await fs.writeFile(
      manifestPath,
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );

    // 更新时间
    const config = await this.getConfig();
    if (config.blocks[blockId]) {
      config.blocks[blockId].updateTime = Date.now();
      await this.updateConfig(config);
    }

    log.info(`Updated manifest for custom block: ${blockId}`);
  }

  // 删除自定义组件
  private async deleteCustomBlock(blockId: string): Promise<void> {
    const blockPath = join(this.customBlocksDir, blockId);

    if (!existsSync(blockPath)) {
      throw new Error(`Custom block "${blockId}" not found`);
    }

    // 删除文件夹
    await fs.rm(blockPath, { recursive: true, force: true });

    // 从配置中移除
    const config = await this.getConfig();
    delete config.blocks[blockId];
    await this.updateConfig(config);

    log.info(`Deleted custom block: ${blockId}`);
  }

  // 检查组件是否存在
  private async checkExists(blockId: string): Promise<boolean> {
    const blockPath = join(this.customBlocksDir, blockId);
    return existsSync(blockPath);
  }

  // 获取配置
  private async getConfig(): Promise<ICustomBlockConfig> {
    try {
      const content = await fs.readFile(this.configPath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      log.error("Failed to read config:", error);
      return { blocks: {} };
    }
  }

  // 更新配置
  private async updateConfig(config: ICustomBlockConfig): Promise<void> {
    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        "utf-8",
      );
    } catch (error) {
      log.error("Failed to write config:", error);
      throw error;
    }
  }

  // 检查和修复组件文件
  private async checkAndRepairComponents(): Promise<void> {
    try {
      log.info("开始检查自定义组件完整性...");
      const config = await this.getConfig();
      const blockIds = Object.keys(config.blocks);

      if (blockIds.length === 0) {
        log.info("配置中没有组件记录");
        return;
      }

      let removedCount = 0;
      const updatedConfig = { ...config };

      for (const blockId of blockIds) {
        const blockPath = join(this.customBlocksDir, blockId);
        const manifestPath = join(blockPath, "manifest.json");
        const sourcePath = join(blockPath, "Component.tsx");
        const readmePath = join(blockPath, "README.md");

        // 检查关键文件是否存在
        const blockExists = existsSync(blockPath);
        const manifestExists = existsSync(manifestPath);
        const sourceExists = existsSync(sourcePath);
        const readmeExists = existsSync(readmePath);

        if (!blockExists || !manifestExists || !sourceExists || !readmeExists) {
          // 文件不完整，从配置中移除
          log.warn(`组件 ${blockId} 文件不完整或丢失，从配置中移除`);
          delete updatedConfig.blocks[blockId];
          removedCount++;
        }
      }

      if (removedCount > 0) {
        await this.updateConfig(updatedConfig);
        log.info(`已从配置中移除 ${removedCount} 个无效组件记录`);
      } else {
        log.info("所有组件文件完整");
      }
    } catch (error) {
      log.error("检查组件完整性失败:", error);
    }
  }
}

export default new CustomBlockModule();
