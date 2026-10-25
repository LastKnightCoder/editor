import { useQuery } from "@tanstack/react-query";
import { getBrowserChatTranscript } from "@/commands/browser-companion";

export const browserChatKey = (url: string, session: string) => ["browser-chat", url, session];

/** 一段网页伴读对话的只读投影（会话文件在 Tau，扩展继续聊时回到这里刷新） */
export function useBrowserChat(url: string, session: string) {
  return useQuery({
    queryKey: browserChatKey(url, session),
    queryFn: () => getBrowserChatTranscript(url, session),
    refetchOnWindowFocus: true,
  });
}
