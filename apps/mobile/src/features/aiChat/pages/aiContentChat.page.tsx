import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppContext } from "../../../app/AppContext";
import {
  createPageSchema,
  definePage,
  paramNumber,
  paramOneOf,
  paramOptional,
  paramString,
  usePage,
} from "../../../router";
import type { ContentChatTarget } from "../contentChat";

// 与对话页同一份懒加载 chunk
const ChatPage = lazy(() => import("../ChatPage").then(module => ({ default: module.ChatPage })));

const schema = createPageSchema({
  contentId: paramNumber(),
  entityType: paramOneOf("card", "article", "project-item", "diary"),
  entityId: paramNumber(),
  title: paramString(),
  /** 选中的原文；缺省表示整篇提问 */
  quote: paramOptional(paramString()),
});
type Params = typeof schema.type;

const fallback = <div className="bg-page fixed inset-0" />;

/** 就近对话：续上这篇最近一次会话，没有就准备一个新会话 id（首条消息发出时才建） */
function AiContentChatScreen() {
  const { params } = usePage<Params>();
  const databaseName = useAppContext().syncSettings.safeSetting?.database?.active ?? "";
  const { data: session } = useQuery({
    queryKey: ["ai-content-chat-session", databaseName, params.contentId],
    queryFn: async () => {
      const { findContentChat } = await import("../../../services/aiChat/chatController");
      const found = await findContentChat(databaseName, params.contentId).catch(() => null);
      return found ? { id: found.id, isNew: false } : { id: crypto.randomUUID(), isNew: true };
    },
    enabled: !!databaseName,
    // 页面在栈里时不重查（重查会换掉还没建好的新会话 id）；离开即丢弃，下次进入重查
    staleTime: Infinity,
    gcTime: 0,
  });
  if (!session) return fallback;
  const target: ContentChatTarget = {
    contentId: params.contentId,
    entityType: params.entityType,
    entityId: params.entityId,
    title: params.title,
    ...(params.quote ? { quote: params.quote } : {}),
  };
  return (
    <Suspense fallback={fallback}>
      <ChatPage
        key={`${session.id}:${params.quote ?? ""}`}
        sessionId={session.id}
        isNew={session.isNew}
        content={target}
      />
    </Suspense>
  );
}

export default definePage({
  key: "aiContentChat",
  match: "params",
  getId: params => String(params.contentId),
  params: schema.schema,
  component: AiContentChatScreen,
});
