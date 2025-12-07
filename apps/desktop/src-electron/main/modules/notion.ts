import { ipcMain } from "electron";
import { Client } from "@notionhq/client";
import { Module } from "../types/module";
import log from "electron-log";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

interface NotionVerifyResult {
  success: boolean;
  userInfo?: {
    name: string;
    email: string;
    avatar: string;
  };
  error?: string;
}

class NotionModule implements Module {
  name: string;

  constructor() {
    this.name = "notion";
  }

  async init() {
    ipcMain.handle("verify_notion_token", async (_event, { token }) => {
      return this.verifyToken(token);
    });

    ipcMain.handle(
      "get_notion_block_info",
      async (_event, { token, blockId }) => {
        return this.getBlockInfo(token, blockId);
      },
    );

    ipcMain.handle(
      "create_notion_page",
      async (_event, { token, parentId, title, blocks }) => {
        return this.createPage(token, parentId, title, blocks);
      },
    );

    ipcMain.handle(
      "get_notion_page_blocks",
      async (_event, { token, pageId }) => {
        return this.getPageBlocks(token, pageId);
      },
    );

    ipcMain.handle(
      "update_notion_page_blocks",
      async (_event, { token, pageId, blocks }) => {
        return this.updatePageBlocks(token, pageId, blocks);
      },
    );

    ipcMain.handle(
      "get_notion_page_info",
      async (_event, { token, pageId }) => {
        return this.getPageInfo(token, pageId);
      },
    );

    ipcMain.handle(
      "append_notion_block",
      async (_event, { token, parentId, block }) => {
        return this.appendBlock(token, parentId, block);
      },
    );

    ipcMain.handle(
      "update_notion_block",
      async (_event, { token, blockId, content }) => {
        return this.updateBlock(token, blockId, content);
      },
    );

    ipcMain.handle(
      "delete_all_notion_blocks",
      async (_event, { token, pageId }) => {
        return this.deleteAllBlocks(token, pageId);
      },
    );

    ipcMain.handle("search_notion_pages", async (_event, { token, query }) => {
      return this.searchPages(token, query);
    });

    ipcMain.handle(
      "update_notion_page_title",
      async (_event, { token, pageId, title }) => {
        return this.updatePageTitle(token, pageId, title);
      },
    );
  }

  async verifyToken(token: string): Promise<NotionVerifyResult> {
    try {
      if (!token || token.trim() === "") {
        return {
          success: false,
          error: "Token 不能为空",
        };
      }

      const notion = new Client({ auth: token });

      // 使用 listUsers API 验证 token 的有效性
      const response = await notion.users.list({});

      // 如果能够成功获取用户列表，说明 token 有效
      if (response && response.results) {
        // 尝试获取当前用户信息（bot 用户）
        const botUser = response.results.find(
          (user: any) => user.type === "bot",
        );

        const userInfo = {
          name: "Notion Integration",
          email: "",
          avatar: "",
        };

        // 如果找到了 bot 用户，提取其信息
        if (botUser && "name" in botUser && botUser.name) {
          userInfo.name = botUser.name;
        }

        // 尝试获取工作区信息作为补充
        try {
          const me = await notion.users.me({});
          if (me && "name" in me && me.name) {
            userInfo.name = me.name;
          }
          if (me && "avatar_url" in me && me.avatar_url) {
            userInfo.avatar = me.avatar_url;
          }
          if (
            me &&
            me.type === "person" &&
            "person" in me &&
            me.person &&
            "email" in me.person
          ) {
            userInfo.email = me.person.email || "";
          }
        } catch (meError) {
          // users.me 可能对某些集成类型不可用，忽略错误
          log.info("Could not fetch me info:", meError);
        }

        return {
          success: true,
          userInfo,
        };
      }

      return {
        success: false,
        error: "无法验证 token",
      };
    } catch (error: any) {
      log.error("Notion token verification failed:", error);

      let errorMessage = "Token 验证失败";

      if (error.code === "unauthorized") {
        errorMessage = "Token 无效或已过期，请检查您的集成密钥";
      } else if (error.code === "restricted_resource") {
        errorMessage = "权限不足，请确保集成有正确的权限";
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getBlockInfo(
    token: string,
    blockId: string,
  ): Promise<{
    success: boolean;
    blockType?: string;
    videoUrl?: string;
    error?: string;
  }> {
    try {
      if (!token || token.trim() === "") {
        return {
          success: false,
          error: "Token 不能为空",
        };
      }

      if (!blockId || blockId.trim() === "") {
        return {
          success: false,
          error: "Block ID 不能为空",
        };
      }

      const notion = new Client({ auth: token });

      // 获取区块信息
      const block = await notion.blocks.retrieve({ block_id: blockId });

      if (!block) {
        return {
          success: false,
          error: "无法获取区块信息",
        };
      }

      // 类型保护：检查是否为完整的区块对象
      if (!("type" in block)) {
        return {
          success: false,
          error: "无法获取区块类型信息",
        };
      }

      // 检查是否为视频区块
      if (block.type !== "video") {
        return {
          success: false,
          error: `该区块不是视频类型，而是 ${block.type} 类型`,
        };
      }

      // 获取视频 URL
      let videoUrl: string | undefined;

      if ("video" in block && block.video) {
        if (block.video.type === "external" && "external" in block.video) {
          videoUrl = block.video.external.url;
        } else if (block.video.type === "file" && "file" in block.video) {
          videoUrl = block.video.file.url;
        }
      }

      if (!videoUrl) {
        return {
          success: false,
          error: "无法获取视频 URL",
        };
      }

      return {
        success: true,
        blockType: block.type,
        videoUrl,
      };
    } catch (error: any) {
      log.error("获取 Notion 区块信息失败:", error);

      let errorMessage = "获取区块信息失败";

      if (error.code === "object_not_found") {
        errorMessage = "找不到该区块，请检查 Block ID 是否正确";
      } else if (error.code === "unauthorized") {
        errorMessage = "Token 无效或已过期";
      } else if (error.code === "restricted_resource") {
        errorMessage = "权限不足，请确保集成有访问该页面的权限";
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 创建 Notion 页面
   */
  async createPage(
    token: string,
    parentId: string,
    title: string,
    blocks: any[] = [],
  ): Promise<{ success: boolean; pageId?: string; error?: string }> {
    try {
      const notion = new Client({ auth: token });

      const response = await notion.pages.create({
        parent: { page_id: parentId },
        properties: {
          title: {
            title: [{ text: { content: title } }],
          },
        },
        children: blocks,
      });

      return {
        success: true,
        pageId: response.id,
      };
    } catch (error: any) {
      log.error("创建 Notion 页面失败:", error);
      return {
        success: false,
        error: error.message || "创建页面失败",
      };
    }
  }

  /**
   * 获取页面所有块
   */
  async getPageBlocks(
    token: string,
    pageId: string,
  ): Promise<{ success: boolean; blocks?: any[]; error?: string }> {
    try {
      const notion = new Client({ auth: token });

      const blocks: any[] = [];
      let cursor: string | undefined = undefined;

      // 分页获取所有块
      do {
        const response = await notion.blocks.children.list({
          block_id: pageId,
          start_cursor: cursor,
          page_size: 100,
        });

        blocks.push(...response.results);
        cursor = response.has_more
          ? response.next_cursor || undefined
          : undefined;
      } while (cursor);

      return {
        success: true,
        blocks,
      };
    } catch (error: any) {
      log.error("获取页面块失败:", error);
      return {
        success: false,
        error: error.message || "获取页面内容失败",
      };
    }
  }

  /**
   * 更新页面块内容（通过删除所有块并追加新块）
   */
  async updatePageBlocks(
    token: string,
    pageId: string,
    blocks: any[],
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const notion = new Client({ auth: token });

      // 获取现有的所有块
      const blocksResult = await this.getPageBlocks(token, pageId);
      if (
        blocksResult.success &&
        blocksResult.blocks &&
        blocksResult.blocks.length > 0
      ) {
        // 删除所有现有块
        for (const block of blocksResult.blocks) {
          try {
            await notion.blocks.delete({ block_id: block.id });
          } catch (error: any) {
            // 忽略已删除的块
            if (error.code !== "object_not_found") {
              log.warn(`删除块 ${block.id} 失败:`, error.message);
            }
          }
        }

        // 等待一小段时间确保删除操作完成
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // 追加新块
      // Notion API 限制每次最多 100 个块
      for (let i = 0; i < blocks.length; i += 100) {
        const chunk = blocks.slice(i, i + 100);
        await notion.blocks.children.append({
          block_id: pageId,
          children: chunk,
        });
      }

      return { success: true };
    } catch (error: any) {
      log.error("更新页面块失败:", error);
      return {
        success: false,
        error: error.message || "更新页面内容失败",
      };
    }
  }

  /**
   * 获取页面基本信息
   */
  async getPageInfo(
    token: string,
    pageId: string,
  ): Promise<{
    success: boolean;
    title?: string;
    lastEditedTime?: string;
    error?: string;
  }> {
    try {
      const notion = new Client({ auth: token });

      const page = await notion.pages.retrieve({ page_id: pageId });

      if (!("properties" in page)) {
        return {
          success: false,
          error: "无法获取页面属性",
        };
      }

      // 提取标题
      let title = "";
      const titleProp = (page as PageObjectResponse).properties.title;
      if (titleProp && "title" in titleProp && titleProp.title.length > 0) {
        title = titleProp.title[0].plain_text;
      }

      return {
        success: true,
        title,
        lastEditedTime: page.last_edited_time,
      };
    } catch (error: any) {
      log.error("获取页面信息失败:", error);
      return {
        success: false,
        error: error.message || "获取页面信息失败",
      };
    }
  }

  /**
   * 追加块到页面
   */
  async appendBlock(
    token: string,
    parentId: string,
    block: any,
  ): Promise<{ success: boolean; blockId?: string; error?: string }> {
    try {
      const notion = new Client({ auth: token });

      const response = await notion.blocks.children.append({
        block_id: parentId,
        children: [block],
      });

      return {
        success: true,
        blockId: response.results[0]?.id,
      };
    } catch (error: any) {
      log.error("追加块失败:", error);
      return {
        success: false,
        error: error.message || "追加块失败",
      };
    }
  }

  /**
   * 更新块内容
   */
  async updateBlock(
    token: string,
    blockId: string,
    content: any,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const notion = new Client({ auth: token });

      await notion.blocks.update({
        block_id: blockId,
        ...content,
      });

      return { success: true };
    } catch (error: any) {
      log.error("更新块失败:", error);
      return {
        success: false,
        error: error.message || "更新块失败",
      };
    }
  }

  /**
   * 删除页面所有块
   */
  async deleteAllBlocks(
    token: string,
    pageId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const notion = new Client({ auth: token });

      // 获取所有块
      const blocksResult = await this.getPageBlocks(token, pageId);
      if (!blocksResult.success || !blocksResult.blocks) {
        return {
          success: false,
          error: blocksResult.error || "获取块列表失败",
        };
      }

      // 删除所有块
      for (const block of blocksResult.blocks) {
        try {
          await notion.blocks.delete({ block_id: block.id });
        } catch (error: any) {
          // 忽略已删除的块
          if (error.code !== "object_not_found") {
            throw error;
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      log.error("删除所有块失败:", error);
      return {
        success: false,
        error: error.message || "删除块失败",
      };
    }
  }

  /**
   * 搜索页面
   */
  async searchPages(
    token: string,
    query: string,
  ): Promise<{
    success: boolean;
    pages?: Array<{ id: string; title: string }>;
    error?: string;
  }> {
    try {
      const notion = new Client({ auth: token });

      const response = await notion.search({
        query,
        filter: { property: "object", value: "page" },
        page_size: 20,
      });

      const pages = response.results
        .filter((item): item is PageObjectResponse => "properties" in item)
        .map((page) => {
          let title = "无标题";

          // Notion 页面标题可能在不同的属性中，需要找到类型为 "title" 的属性
          for (const prop of Object.values(page.properties)) {
            if (
              prop.type === "title" &&
              "title" in prop &&
              prop.title.length > 0
            ) {
              title = prop.title.map((t: any) => t.plain_text).join("");
              break;
            }
          }

          return {
            id: page.id,
            title,
          };
        });

      return {
        success: true,
        pages,
      };
    } catch (error: any) {
      log.error("搜索页面失败:", error);
      return {
        success: false,
        error: error.message || "搜索页面失败",
      };
    }
  }

  /**
   * 更新页面标题
   */
  async updatePageTitle(
    token: string,
    pageId: string,
    title: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const notion = new Client({ auth: token });

      await notion.pages.update({
        page_id: pageId,
        properties: {
          title: {
            title: [
              {
                text: {
                  content: title,
                },
              },
            ],
          },
        },
      });

      return { success: true };
    } catch (error: any) {
      log.error("更新页面标题失败:", error);
      return {
        success: false,
        error: error.message || "更新页面标题失败",
      };
    }
  }
}

export default new NotionModule();
