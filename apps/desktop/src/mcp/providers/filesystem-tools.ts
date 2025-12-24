import type { ToolParameterSchema } from "@/types";
import { readTextFile } from "@/commands/file";
import type { MCPProviderDefinition } from "./types";

export const filesystemToolsProvider: MCPProviderDefinition = {
  id: "filesystem-tools",
  name: "文件系统工具",
  description:
    "提供文件读取工具，支持读取任意路径的纯文本文件。可用于读取 Skill 目录下的模板、示例等文件。",
  defaultEnabled: true,
  tools: () => [
    {
      name: "read_file",
      description:
        "读取指定路径的纯文本文件内容。支持读取任意路径的文件，包括 Skill " +
        "目录下的模板、示例等文件。对于二进制文件会返回错误。" +
        "可以设置 maxLength 参数限制读取的字符数，避免内容过长。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的绝对路径",
          },
          maxLength: {
            type: "number",
            description:
              "可选，最大读取字符数。默认无限制，建议设置为 50000 避免内容过长",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["path"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const path = args.path as string;
        const maxLength = args.maxLength as number | undefined;

        // 验证路径
        if (!path || typeof path !== "string") {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: "必须提供有效的文件路径",
              },
              null,
              2,
            ),
          };
        }

        try {
          let content = await readTextFile(path);
          let truncated = false;
          const originalLength = content.length;

          if (maxLength && content.length > maxLength) {
            content = content.substring(0, maxLength);
            truncated = true;
          }

          return {
            content: JSON.stringify(
              {
                success: true,
                path,
                content,
                truncated,
                ...(truncated
                  ? {
                      originalLength,
                      truncatedLength: maxLength,
                    }
                  : {}),
              },
              null,
              2,
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              {
                success: false,
                path,
                error: `读取文件失败: ${(error as Error).message}`,
              },
              null,
              2,
            ),
          };
        }
      },
    },
  ],
};
