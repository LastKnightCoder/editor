/**
 * 网页对话（只读）：浏览器伴读的一段对话在 Tau 里的完整呈现——消息、思考与工具卡片都用桌面对话的
 * 同一套渲染（含桌面专用卡片与插件卡片）。继续聊天回到网页里的伴读面板；离开再回来时自动刷新。
 */
import { useMemo } from "react";
import { ExternalLink, MessagesSquare } from "lucide-react";
import { Button, Loading } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import { usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { openExternal } from "@/commands/extra";
import MessageItem from "@/components/ChatSidebar/MessageItem";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import { useBrowserChat } from "../queries";

type Params = { url: string; session: string };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function BrowserChatView() {
  const { url, session } = usePageParams<Params>();
  const { data, isLoading } = useBrowserChat(url, session);
  const isDark = useThemeStore(state => state.mode === "dark");
  const markdownComponents = useChatMarkdownComponents({
    isDark,
    idPrefix: `browser-chat-${session}`,
  });

  const breadcrumb = useMemo(
    () => (
      <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1">
        <span className="max-w-[24ch] truncate px-1">{hostOf(url)}</span>
        <span className="text-ink-3">/</span>
        <span className="text-ink-1 max-w-[44ch] truncate px-1 font-medium">
          {data?.title || "网页对话"}
        </span>
      </span>
    ),
    [data?.title, url]
  );
  usePageBreadcrumb("browser-chat", breadcrumb);

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-4">
      <section className="bg-surface rounded-tau-lg shadow-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-6 pt-5 pb-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-tau-title-lg text-ink-1 truncate font-semibold">
              {data?.title || "网页对话"}
            </h1>
            <p className="text-tau-meta text-ink-3 truncate">{url}</p>
          </div>
          <Button size="sm" icon={ExternalLink} onClick={() => void openExternal(url)}>
            打开网页
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <Loading />
          ) : !data ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
              <MessagesSquare size={28} strokeWidth={1.5} className="text-ink-3 mb-2" />
              <p className="text-ink-1 text-[15px] font-semibold">这段对话已不存在</p>
              <p className="text-tau-sm text-ink-2">可能已在浏览器伴读里开始了新的对话。</p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[760px] px-6 pb-8">
              {data.messages.map((message, index) => (
                <MessageItem
                  key={message.clientId ?? index}
                  message={message}
                  isDark={isDark}
                  markdownComponents={markdownComponents}
                  isVisible
                  messageIndex={index}
                />
              ))}
              <p className="text-tau-sm text-ink-3 mt-6 text-center">
                继续这段对话请回到网页里的伴读面板
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
