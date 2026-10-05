import { useEffect, useState } from "react";
import {
  listChats,
  subscribeChatStoreConnection,
  type ChatListEntry,
} from "../services/chatStoreClient";
import { pageIdentity } from "./useChatSessions";

/** 当前页面的对话列表（只读，按更新时间倒序）；refreshKey 变化时重读 */
export function useChatList(rawUrl: string | null, refreshKey?: unknown) {
  const url = pageIdentity(rawUrl);
  const [connected, setConnected] = useState(false);
  const [chats, setChats] = useState<ChatListEntry[]>([]);

  useEffect(() => subscribeChatStoreConnection(setConnected), []);

  useEffect(() => {
    if (!url || !connected) {
      setChats([]);
      return;
    }
    let alive = true;
    listChats(url)
      .then(entries => {
        if (alive) setChats([...entries].sort((a, b) => b.updateTime - a.updateTime));
      })
      .catch(error => console.warn("读取对话列表失败:", error));
    return () => {
      alive = false;
    };
  }, [url, connected, refreshKey]);

  return chats;
}
