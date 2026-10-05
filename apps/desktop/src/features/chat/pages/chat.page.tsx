/**
 * AI 对话 page 定义：key "chat" 与 navigation.ts 一致，真实注册接管侧边栏入口
 * （legacy.tsx 的占位同步删除）。全局一份（single）；id = 当前会话（侧栏子项 /
 * 全部会话弹窗 / 停靠栏「在对话页打开」），缺省为新对话空态。切会话经栈机原位更新参数。
 * seedQuestion = 从问题「围绕它聊」进入（只对新对话生效）。
 */

import {
  createPageSchema,
  paramNumber,
  paramOptional,
  paramString,
} from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { ChatView } from "../views/ChatView";

const schema = createPageSchema({
  id: paramOptional(paramString()),
  entry: paramOptional(paramString()),
  /** 围绕问题发起：新对话首条消息带上问题上下文，登记后挂成问题的探究对话 */
  seedQuestion: paramOptional(paramNumber()),
});

export default definePage({
  key: "chat",
  match: "single",
  label: "AI 对话",
  params: schema.schema,
  component: ChatView,
});
