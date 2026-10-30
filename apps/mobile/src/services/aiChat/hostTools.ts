// 对话宿主能力：把宿主工具、内置 Skill 与 ask-question 注册到 MobileAiService，按库作用域释放。

import {
  ASK_QUESTION_DESCRIPTION,
  ASK_QUESTION_PARAMETERS,
  ASK_QUESTION_TOOL_NAME,
} from "@tau/shared/chat-core";
import type { MobileAiService } from "../ai";
import { internalSkillSource } from "./skills";
import {
  getContentMarkdownTool,
  getCurrentDateTool,
  searchKnowledgeTool,
  sqlQueryTool,
} from "./readTools";
import { TASK_TOOLS } from "./taskTools";
import { HOST_TOOL_SOURCE, hostToolId, type HostTool } from "./tool";

const EXECUTION_IDENTITY = "host:mobile-chat:1";

export function hostToolsFor(databaseName: string): readonly HostTool[] {
  return [
    getCurrentDateTool,
    searchKnowledgeTool,
    getContentMarkdownTool,
    sqlQueryTool(() => databaseName),
    ...TASK_TOOLS,
  ];
}

/** 注册后返回本库全部宿主工具 id（含 ask-question），供 runs.start 的 toolIds */
export function registerHostCapabilities(service: MobileAiService, databaseName: string) {
  const scope = { databaseName };
  const releases: Array<() => void> = [];
  for (const tool of hostToolsFor(databaseName))
    releases.push(
      service.tools.register(
        {
          id: hostToolId(tool.name),
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          risk: tool.risk,
          sourceId: HOST_TOOL_SOURCE,
          executionIdentity: EXECUTION_IDENTITY,
        },
        (input, context) =>
          tool.execute(
            input && typeof input === "object" ? (input as Record<string, unknown>) : {},
            context
          ),
        scope
      )
    );
  releases.push(
    service.tools.register(
      {
        id: hostToolId(ASK_QUESTION_TOOL_NAME),
        name: ASK_QUESTION_TOOL_NAME,
        description: ASK_QUESTION_DESCRIPTION,
        inputSchema: ASK_QUESTION_PARAMETERS as unknown as Record<string, unknown>,
        risk: "read",
        sourceId: HOST_TOOL_SOURCE,
        executionIdentity: EXECUTION_IDENTITY,
      },
      (input, context) => service.interactions.requestQuestion(input, context),
      scope
    )
  );
  releases.push(service.skills.registerSource(internalSkillSource, scope));
  const toolIds = [
    ...hostToolsFor(databaseName).map(tool => hostToolId(tool.name)),
    hostToolId(ASK_QUESTION_TOOL_NAME),
  ];
  return {
    toolIds,
    dispose: () => {
      for (const release of releases.splice(0).reverse()) release();
    },
  };
}

const pad = (value: number) => String(value).padStart(2, "0");
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

/** 对话系统提示：通用助手 + 会话时间，与桌面口径一致；末尾说明手机端写入与能力边界 */
export function buildChatSystemPrompt(now = new Date()) {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return [
    "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。",
    "你运行在 Tau 的手机端，可以检索和阅读用户的笔记、查询数据库、管理待办与日程。修改数据的工具每次执行前都会请用户确认，被拒绝时不要重复尝试，改为询问用户想怎么做。",
    "回答保持简洁，适合手机屏幕阅读；引用笔记时使用 :ref[显示文本]{id=ID type=类型}。",
    "",
    "<SESSION_TIME_CONTEXT>",
    "当前会话时间信息：",
    `- 今天日期：${day}`,
    `- 今天星期：${WEEKDAYS[now.getDay()]}`,
    `- 当前本地时间：${day} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    "当用户提到“今天 / 昨天 / 明天 / 最近”等相对时间时，请优先以以上时间信息为准；若时间语义仍有歧义，可以使用 ask-question 进一步确认。",
    "</SESSION_TIME_CONTEXT>",
  ].join("\n");
}
