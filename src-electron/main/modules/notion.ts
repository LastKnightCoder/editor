import { ipcMain } from "electron";
import { Client } from "@notionhq/client";
import { Module } from "../types/module";
import log from "electron-log";

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
}

export default new NotionModule();
