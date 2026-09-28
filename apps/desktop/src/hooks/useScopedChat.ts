/**
 * 一个聊天面板的会话状态（M4）：五个场景的面板共用。取代原先每个面板里各写一遍的
 * 「chats / currentChatId / createChat / updateChat / deleteChat」接线。
 *
 * - 列表 = 统一会话 store 里该 bucket 的目录行；
 * - 当前对话：受控模式（对话页由页面参数驱动）传 selectedId/onSelect，否则用 store 里持久化的
 *   currentIds[bucket]；
 * - 没有选中项 = 新对话草稿（真 id，存在面板自己的草稿槽里，首轮发送后登记、id 不变）；
 * - 选中的 id 在目录里查不到（被删、旧版本的 number id）→ 退回草稿。
 */
import { useEffect, useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { ChatMessage } from "@/types";
import useChatSessionStore, {
  ChatBucketStatus,
  bucketKeyOf,
  draftFor,
  resetDraft,
  rowToChat,
  selectBucketStatus,
  selectRows,
  type ChatBucketRef,
} from "@/stores/useChatSessionStore";
import { chatSessionKey, piChatSessionManager } from "@/services/piChatSession";

export interface UseScopedChatOptions {
  /** 草稿槽：同一场景的不同面板（停靠栏 / 对话页）各有自己的新对话 */
  draftSlot: string;
  /** 受控：当前对话 id 由外部（页面参数）决定 */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** 列表由外部加载（主聊天在应用启动时加载）；缺省由本 hook 按 bucket 加载 */
  autoLoad?: boolean;
}

export function useScopedChat(bucket: ChatBucketRef, options: UseScopedChatOptions) {
  const { autoLoad = true, draftSlot } = options;
  const key = bucketKeyOf(bucket);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useChatSessionStore(useMemo(() => selectRows(bucket), [key]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = useChatSessionStore(useMemo(() => selectBucketStatus(bucket), [key]));
  const storedId = useChatSessionStore(state => state.currentIds[key] ?? null);
  const controlled = options.selectedId !== undefined;
  const requestedId = controlled ? (options.selectedId ?? null) : storedId;
  const row = requestedId ? rows.find(item => item.id === requestedId) : undefined;
  // 草稿槽版本：点「新对话」时换一个新草稿
  const [draftVersion, setDraftVersion] = useState(0);
  const draftSlotKey = `${draftSlot}|${key}`;
  const draft = useMemo(
    () => draftFor(draftSlotKey, bucket),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftSlotKey, draftVersion]
  );
  // 选中项有效：目录里有它，或它是已打开的对话（刚登记、目录行还没回来）/ 本面板的草稿
  const requestedOpen = useChatSessionStore(state =>
    requestedId ? Boolean(state.opened[requestedId]) : false
  );
  const selectedId = row || requestedOpen || requestedId === draft.id ? requestedId : null;
  const openedId = selectedId ?? draft.id;
  const opened = useChatSessionStore(state => state.opened[openedId]);

  useEffect(() => {
    if (autoLoad) void useChatSessionStore.getState().loadBucket(bucket);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, autoLoad]);

  const select = useMemoizedFn((id: string | null) => {
    if (controlled) options.onSelect?.(id);
    else useChatSessionStore.getState().setCurrent(bucket, id);
  });

  // 选中了已登记但还没打开的对话：读投影
  useEffect(() => {
    if (row && !opened) void useChatSessionStore.getState().openChat(row.id);
  }, [row, opened]);

  // 选中项失效（被删、属于别的库、旧版本的 id）：列表加载完后退回新对话
  const loaded = status === ChatBucketStatus.SUCCESS || status === ChatBucketStatus.FAIL;
  useEffect(() => {
    if (loaded && requestedId && !selectedId) select(null);
  }, [loaded, requestedId, selectedId, select]);

  const currentChat: ChatMessage = opened ?? (row ? rowToChat(row) : draft);

  /** 新对话：换一个新草稿并选中它（草稿不落库） */
  const newChat = useMemoizedFn(() => {
    resetDraft(draftSlotKey);
    setDraftVersion(version => version + 1);
    select(null);
  });

  const rename = useMemoizedFn((id: string, title: string) =>
    useChatSessionStore.getState().renameChat(id, title)
  );

  /** 删除对话：先释放宿主会话与运行态，再删目录行（主进程连会话文件一起删） */
  const remove = useMemoizedFn(async (id: string) => {
    const databaseName = currentChat.databaseName;
    const key = chatSessionKey(bucket.scope, id, databaseName);
    const { piChatRuntime } = await import("@/services/piChatRuntime");
    await piChatSessionManager.disposeByKey(key);
    // 会话终态：归约条目必须一起清，否则删掉的对话仍在后台归约
    piChatRuntime.disposeConversation(key);
    await useChatSessionStore.getState().deleteChat(id, databaseName);
    if (selectedId === id) select(null);
  });

  return {
    rows,
    status,
    loaded,
    currentChat,
    select,
    newChat,
    rename,
    remove,
  };
}
