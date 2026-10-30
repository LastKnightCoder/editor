import { lazy, Suspense } from "react";
import { createPageSchema, definePage, paramOptional, paramString, usePage } from "../../../router";

// 对话页带上聊天渲染与 AI 运行时，懒加载不进首屏包
const ChatPage = lazy(() => import("../ChatPage").then(module => ({ default: module.ChatPage })));

const schema = createPageSchema({
  sessionId: paramString(),
  /** 新对话：首条消息发出时才建会话 */
  isNew: paramOptional(paramString()),
  /** 从首页问答条带来的问题，进入后自动发出 */
  prompt: paramOptional(paramString()),
});
type Params = typeof schema.type;

function AiChatScreen() {
  const { params } = usePage<Params>();
  return (
    <Suspense fallback={<div className="bg-page fixed inset-0" />}>
      <ChatPage
        key={params.sessionId}
        sessionId={params.sessionId}
        isNew={params.isNew === "1"}
        prompt={params.prompt}
      />
    </Suspense>
  );
}

export default definePage({
  key: "aiChat",
  match: "params",
  getId: params => params.sessionId,
  params: schema.schema,
  component: AiChatScreen,
});
