/**
 * 统一会话 store（M4）：五个聊天场景（主聊天/停靠栏、PDF、视频笔记、学习项目）共用，
 * 取代原先四个结构几乎相同的 store（useChatMessageStore / usePdfChatStore /
 * useVideoNoteChatStore / useVLChatStore）。
 *
 * 数据分两层：
 * - **目录行**（chat_session，按 scope + domainRef 分桶）：列表 UI 只读它，不带消息载荷；
 * - **已打开对话**（id → ChatMessage）：消息来自 pi JSONL 的投影（piSessionTranscript），
 *   运行时（piChatRuntime）的聊天容器直接发布到这里。
 *
 * 新对话 = 草稿：点「新对话」时就生成真 id（crypto.randomUUID），目录表里查不到它就是草稿；
 * 首轮发送时宿主以这个 id 建会话，拿到回传的 sessionFile 再登记目录行。id 从头到尾不变，
 * 不再需要 id 0→N 的迁移机制。
 *
 * 模块级、无组件生命周期：切页卸载后后台轮次仍能写回这里。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatGroup, ChatMessage, ChatSessionMessage } from "@/types";
import type { ChatSessionRow, ChatSessionScope } from "@/types/chat-session";
import {
  createChatSession,
  deleteChatSession,
  listChatSessions,
  pinChatSession,
  unpinChatSession,
  updateChatSession,
} from "@/commands/chat-session";
import {
  createChatGroup,
  deleteChatGroup,
  getAllChatGroups,
  updateChatGroup,
} from "@/commands/chat-message";
import { piSessionEdit, piSessionTranscript, type PiSessionEdit } from "@/commands/piSession";
import { chatIdentity, getChatDatabase } from "@/services/chatDatabase";
import useSettingStore from "@/stores/useSettingStore";

const deletedChats = new Set<string>();
const libraryGenerations = new Map<string, number>();
const generationOf = (databaseName: string) => libraryGenerations.get(databaseName) ?? 0;
let loadedDatabase: string | undefined;

/** 场景 + 所属对象：一个列表 */
export interface ChatBucketRef {
  scope: ChatSessionScope;
  domainRef: string | null;
}

export const bucketKeyOf = ({ scope, domainRef }: ChatBucketRef) => `${scope}|${domainRef ?? ""}`;

/** 从 ChatContainer 的 chatScope（`pdf-chat:12`、`main-chat`）解析出分桶 */
export const bucketOfChatScope = (chatScope: string): ChatBucketRef => {
  const [scope, ...rest] = chatScope.split(":");
  return {
    scope: scope as ChatSessionScope,
    domainRef: rest.length > 0 ? rest.join(":") : null,
  };
};

export enum ChatBucketStatus {
  UN_INIT,
  LOADING,
  SUCCESS,
  FAIL,
}

interface ChatBucket {
  rows: ChatSessionRow[];
  status: ChatBucketStatus;
}

/** 目录行 → 渲染层对话（消息另读；未打开时为空） */
export const rowToChat = (
  row: ChatSessionRow,
  messages: ChatSessionMessage[] = [],
  databaseName = getChatDatabase()
): ChatMessage => ({
  databaseName,
  id: row.id,
  createTime: row.createTime,
  updateTime: row.updateTime,
  messages,
  title: row.title,
  titleDirty: row.titleDirty,
  groupId: row.groupId,
  archived: row.archived,
  orderNum: row.orderNum,
  source: row.source,
  sessionFile: row.sessionFile,
  scope: row.scope,
  domainRef: row.domainRef,
});

/** 新对话草稿：真 id，目录表里还没有它（首轮发送后才登记） */
export const createDraftChat = (bucket: ChatBucketRef): ChatMessage => {
  const now = Date.now();
  return {
    databaseName: getChatDatabase(),
    id: crypto.randomUUID(),
    createTime: now,
    updateTime: now,
    messages: [],
    title: "新对话",
    titleDirty: false,
    groupId: null,
    archived: false,
    orderNum: null,
    scope: bucket.scope,
    domainRef: bucket.domainRef,
  };
};

interface ChatSessionState {
  buckets: Record<string, ChatBucket>;
  /** 每个列表当前选中的对话（持久化；旧版本存的 number 读出时丢弃） */
  currentIds: Record<string, string | null>;
  /** 已打开对话（含草稿）：消息为 JSONL 投影 + 运行时实时快照 */
  opened: Record<string, ChatMessage>;
  groups: ChatGroup[];
  /** 草稿选过的工作目录（不落库，登记时写进目录行） */
  draftCwds: Record<string, string>;
}

interface ChatSessionActions {
  /**
   * 在分组里新建对话（「全部会话」里的「添加对话」）：生成一个带 groupId 的草稿并打开，
   * 首轮发送登记时带上分组。返回草稿 id，由调用方选中它。
   */
  openDraftInGroup(bucket: ChatBucketRef, groupId: number | null): string;
  loadBucket(bucket: ChatBucketRef): Promise<void>;
  loadGroups(): Promise<void>;
  /** 重载全部已加载的列表（切库） */
  reloadAll(): Promise<void>;
  /**
   * 所属对象要被删（PDF 等，M4-e）：释放这个列表下全部对话的宿主会话与运行态，并从 store 里拿掉。
   * 目录行与会话文件由主进程删对象时级联删除。
   */
  releaseBucket(bucket: ChatBucketRef): Promise<void>;
  setCurrent(bucket: ChatBucketRef, id: string | null): void;
  /** 打开对话：已打开的直接复用；目录里有就读投影；都没有返回 undefined */
  openChat(id: string): Promise<ChatMessage | undefined>;
  /** 运行时发布的聊天快照（流式期间高频调用；只更新已打开对话） */
  publishChat(chat: ChatMessage): void;
  /** 首轮发送：登记目录行（草稿 → 正式对话） */
  registerChat(chat: ChatMessage, sessionFile: string): Promise<ChatSessionRow>;
  /** settled 后：读 JSONL 投影并更新目录行消息数/时间（回写容器由 runtime 做） */
  settleChat(
    id: string,
    databaseName?: string,
    sessionFile?: string
  ): Promise<ChatSessionMessage[] | null>;
  renameChat(id: string, title: string, databaseName?: string): Promise<void>;
  /** 改对话的工作目录（下一轮起生效，宿主会话按新目录重建；空串 = 跟随默认） */
  setChatCwd(id: string, cwd: string): Promise<void>;
  evictChat(id: string, databaseName?: string): void;
  archiveChat(id: string, archived: boolean): Promise<void>;
  moveChatToGroup(id: string, groupId: number | null): Promise<void>;
  pinChat(id: string): Promise<void>;
  unpinChat(id: string): Promise<void>;
  deleteChat(id: string, databaseName?: string): Promise<void>;
  /**
   * 改会话树（回退/分叉/切版本/删除，M4-d）：返回改后的投影，由调用方（聊天容器）回写。
   * 运行中主进程会拒绝（抛错）。
   */
  editChat(id: string, edit: PiSessionEdit): Promise<ChatSessionMessage[]>;
  createGroup(name: string, parentId?: number | null): Promise<ChatGroup>;
  renameGroup(id: number, name: string): Promise<ChatGroup>;
  deleteGroup(id: number): Promise<void>;
}

/** 列表排序与主进程 list 一致：置顶在前（order_num 升序），其余按最近更新降序 */
const sortRows = (rows: ChatSessionRow[]) =>
  [...rows].sort((a, b) => {
    const aPinned = a.orderNum !== null;
    const bPinned = b.orderNum !== null;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned) return (a.orderNum ?? 0) - (b.orderNum ?? 0);
    return b.updateTime - a.updateTime;
  });

let loadSequence = 0;
const bucketSequences = new Map<string, number>();

const useChatSessionStore = create<ChatSessionState & ChatSessionActions>()(
  persist(
    (set, get) => {
      const findRow = (id: string): ChatSessionRow | undefined => {
        for (const bucket of Object.values(get().buckets)) {
          const row = bucket.rows.find(item => item.id === id);
          if (row) return row;
        }
        return undefined;
      };

      /** 目录行增删改都走这里：定位到所在桶替换（桶还没加载就跳过，加载时会从库里读到） */
      const upsertRow = (row: ChatSessionRow) => {
        const key = bucketKeyOf({ scope: row.scope as ChatSessionScope, domainRef: row.domainRef });
        set(state => {
          const bucket = state.buckets[key];
          if (!bucket) return state;
          const rows = bucket.rows.some(item => item.id === row.id)
            ? bucket.rows.map(item => (item.id === row.id ? row : item))
            : [...bucket.rows, row];
          const opened = state.opened[row.id]
            ? {
                ...state.opened,
                [row.id]: {
                  ...rowToChat(row, state.opened[row.id].messages),
                },
              }
            : state.opened;
          return {
            buckets: { ...state.buckets, [key]: { ...bucket, rows: sortRows(rows) } },
            opened,
          };
        });
      };

      const patchRow = async (
        id: string,
        patch: Parameters<typeof updateChatSession>[1],
        databaseName = getChatDatabase()
      ) => {
        const generation = generationOf(databaseName);
        if (deletedChats.has(chatIdentity(id, databaseName))) return;
        const updated = await updateChatSession(id, patch, databaseName);
        if (
          updated &&
          generation === generationOf(databaseName) &&
          databaseName === getChatDatabase() &&
          !deletedChats.has(chatIdentity(id, databaseName))
        )
          upsertRow(updated);
      };

      return {
        buckets: {},
        currentIds: {},
        opened: {},
        groups: [],
        draftCwds: {},

        loadBucket: async bucket => {
          const databaseName = getChatDatabase();
          const key = bucketKeyOf(bucket);
          const sequence = ++loadSequence;
          bucketSequences.set(key, sequence);
          set(state => ({
            buckets: {
              ...state.buckets,
              [key]: {
                rows: state.buckets[key]?.rows ?? [],
                status: ChatBucketStatus.LOADING,
              },
            },
          }));
          try {
            // 归档由 UI 自己分组
            const rows = await listChatSessions({
              scope: bucket.scope,
              domainRef: bucket.domainRef,
              includeArchived: true,
            });
            if (databaseName !== getChatDatabase() || bucketSequences.get(key) !== sequence) return;
            set(state => ({
              buckets: {
                ...state.buckets,
                [key]: { rows: sortRows(rows), status: ChatBucketStatus.SUCCESS },
              },
            }));
          } catch (error) {
            console.error("[chatSession] 加载对话列表失败:", error);
            if (bucketSequences.get(key) !== sequence) return;
            set(state => ({
              buckets: { ...state.buckets, [key]: { rows: [], status: ChatBucketStatus.FAIL } },
            }));
          }
        },

        loadGroups: async () => {
          const databaseName = getChatDatabase();
          const groups = await getAllChatGroups();
          if (databaseName === getChatDatabase()) set({ groups });
        },

        reloadAll: async () => {
          const databaseName = getChatDatabase();
          libraryGenerations.set(databaseName, generationOf(databaseName) + 1);
          for (const identity of deletedChats) {
            if (JSON.parse(identity)[0] === databaseName) deletedChats.delete(identity);
          }
          // 切库：已打开的对话属于旧库，整体作废（运行中的后台轮次由 runtime 自己收尾）。
          // runtime 的空闲条目一起清（M4-e）；宿主会话由主进程在切库时释放
          const keys = Object.keys(get().buckets);
          bucketSequences.clear();
          draftSlots.clear();
          set({ opened: {}, buckets: {}, currentIds: {}, groups: [] });
          const { piChatRuntime } = await import("@/services/piChatRuntime");
          if (loadedDatabase === getChatDatabase())
            piChatRuntime.invalidateLibrary(getChatDatabase());
          else piChatRuntime.releaseIdle();
          loadedDatabase = getChatDatabase();
          await Promise.all(
            keys.map(key => {
              const [scope, domainRef] = key.split("|");
              return get().loadBucket({
                scope: scope as ChatSessionScope,
                domainRef: domainRef || null,
              });
            })
          );
        },

        releaseBucket: async bucket => {
          const key = bucketKeyOf(bucket);
          // 列表可能还没加载（没打开过这个 PDF 的对话面板）：直接查一次目录，保证运行中的也释放
          const rows =
            get().buckets[key]?.rows ??
            (await listChatSessions({
              scope: bucket.scope,
              domainRef: bucket.domainRef,
              includeArchived: true,
            }).catch(() => []));
          const [{ piChatRuntime }, { chatSessionKey, piChatSessionManager }] = await Promise.all([
            import("@/services/piChatRuntime"),
            import("@/services/piChatSession"),
          ]);
          await Promise.all(
            rows.map(row => piChatSessionManager.disposeChatSession(bucket.scope, row.id))
          );
          rows.forEach(row =>
            piChatRuntime.disposeConversation(chatSessionKey(bucket.scope, row.id))
          );
          const ids = new Set(rows.map(row => row.id));
          set(state => {
            const buckets = { ...state.buckets };
            delete buckets[key];
            const opened = { ...state.opened };
            ids.forEach(id => delete opened[id]);
            const currentIds = { ...state.currentIds };
            delete currentIds[key];
            return { buckets, opened, currentIds };
          });
        },

        setCurrent: (bucket, id) => {
          set(state => ({ currentIds: { ...state.currentIds, [bucketKeyOf(bucket)]: id } }));
        },

        openChat: async id => {
          const databaseName = getChatDatabase();
          const generation = generationOf(databaseName);
          const identity = chatIdentity(id, databaseName);
          if (deletedChats.has(identity)) return undefined;
          const existing = get().opened[id];
          if (existing) return existing;
          const row = findRow(id);
          if (!row) return undefined;
          const outcome = await piSessionTranscript({ sessionFile: row.sessionFile, databaseName });
          if (
            generation !== generationOf(databaseName) ||
            databaseName !== getChatDatabase() ||
            deletedChats.has(identity)
          )
            return undefined;
          if (!outcome.ok) {
            console.error("[chatSession] 读取对话内容失败:", outcome.error);
          }
          // 读投影期间运行时可能已经发布过（后台轮次）：以已发布的为准
          const current = get().opened[id];
          if (current) return current;
          const chat = rowToChat(findRow(id) ?? row, outcome.messages ?? []);
          set(state => ({ opened: { ...state.opened, [id]: chat } }));
          return chat;
        },

        openDraftInGroup: (bucket, groupId) => {
          const draft = { ...createDraftChat(bucket), groupId };
          set(state => ({ opened: { ...state.opened, [draft.id]: draft } }));
          return draft.id;
        },

        publishChat: chat => {
          const databaseName = chat.databaseName ?? getChatDatabase();
          if (
            databaseName !== getChatDatabase() ||
            deletedChats.has(chatIdentity(chat.id, databaseName))
          )
            return;
          set(state => ({ opened: { ...state.opened, [chat.id]: chat } }));
        },

        evictChat: (id, databaseName = getChatDatabase()) => {
          if (databaseName !== getChatDatabase()) return;
          set(state => {
            const opened = { ...state.opened };
            delete opened[id];
            return { opened };
          });
        },

        registerChat: async (chat, sessionFile) => {
          const databaseName = chat.databaseName ?? getChatDatabase();
          if (deletedChats.has(chatIdentity(chat.id, databaseName))) throw new Error("对话已删除");
          const row = await createChatSession(
            {
              id: chat.id,
              scope: chat.scope ?? "main-chat",
              domainRef: chat.domainRef ?? null,
              sessionFile,
              cwd:
                (chat.scope ?? "main-chat") === "main-chat"
                  ? (get().draftCwds[chat.id] ?? defaultChatCwd())
                  : "",
              title: chat.title,
              titleDirty: chat.titleDirty ?? false,
              groupId: chat.groupId ?? null,
              messageCount: 0,
            },
            databaseName
          );
          if (deletedChats.has(chatIdentity(chat.id, databaseName))) {
            await deleteChatSession(chat.id, databaseName);
            throw new Error("对话已删除");
          }
          releaseDraft(chat.id);
          if (chat.id in get().draftCwds) {
            set(state => {
              const draftCwds = { ...state.draftCwds };
              delete draftCwds[chat.id];
              return { draftCwds };
            });
          }
          if (
            databaseName === getChatDatabase() &&
            !deletedChats.has(chatIdentity(chat.id, databaseName))
          )
            upsertRow(row);
          return row;
        },

        settleChat: async (id, databaseName = getChatDatabase(), sessionFile) => {
          const generation = generationOf(databaseName);
          // 草稿首轮在出现第一条回答前就失败：pi 不落盘、也没登记，没有可读的
          if (deletedChats.has(chatIdentity(id, databaseName))) return null;
          const row = databaseName === getChatDatabase() ? findRow(id) : undefined;
          const file = sessionFile ?? row?.sessionFile;
          if (!file) return null;
          const outcome = await piSessionTranscript({ sessionFile: file, databaseName });
          if (
            generation !== generationOf(databaseName) ||
            deletedChats.has(chatIdentity(id, databaseName))
          )
            return null;
          if (!outcome.ok || !outcome.messages) return null;
          const messages = outcome.messages;
          await patchRow(
            id,
            {
              messageCount: messages.filter(message => message.role === "user").length,
              updateTime: Date.now(),
            },
            databaseName
          );
          return messages;
        },

        renameChat: async (id, title, databaseName = getChatDatabase()) => {
          if (databaseName !== getChatDatabase()) {
            await patchRow(id, { title, titleDirty: true }, databaseName);
            return;
          }
          const row = findRow(id);
          if (!row) {
            // 草稿：只改内存，登记时带上
            const draft = get().opened[id];
            if (draft) get().publishChat({ ...draft, title, titleDirty: true });
            return;
          }
          // 手动改名与生成的标题都置 titleDirty（生成过就不再生成）
          await patchRow(id, { title, titleDirty: true });
        },

        setChatCwd: async (id, cwd) => {
          const row = findRow(id);
          if (!row) {
            set(state => ({ draftCwds: { ...state.draftCwds, [id]: cwd } }));
            return;
          }
          // 换目录不算内容更新：保留 update_time，列表顺序不动
          await patchRow(id, { cwd, updateTime: row.updateTime });
        },

        archiveChat: (id, archived) => patchRow(id, { archived }),

        moveChatToGroup: (id, groupId) => patchRow(id, { groupId }),

        pinChat: async id => {
          const databaseName = getChatDatabase();
          const row = await pinChatSession(id);
          if (row && databaseName === getChatDatabase()) upsertRow(row);
        },

        unpinChat: async id => {
          const databaseName = getChatDatabase();
          const row = await unpinChatSession(id);
          if (row && databaseName === getChatDatabase()) upsertRow(row);
        },

        deleteChat: async (id, databaseName = getChatDatabase()) => {
          const identity = chatIdentity(id, databaseName);
          deletedChats.add(identity);
          try {
            await deleteChatSession(id, databaseName);
          } catch (error) {
            deletedChats.delete(identity);
            throw error;
          }
          if (databaseName !== getChatDatabase()) return;
          set(state => {
            const buckets: Record<string, ChatBucket> = {};
            for (const [key, bucket] of Object.entries(state.buckets)) {
              buckets[key] = { ...bucket, rows: bucket.rows.filter(item => item.id !== id) };
            }
            const opened = { ...state.opened };
            delete opened[id];
            const currentIds = { ...state.currentIds };
            for (const [key, current] of Object.entries(currentIds)) {
              if (current === id) currentIds[key] = null;
            }
            return { buckets, opened, currentIds };
          });
        },

        editChat: async (id, edit) => {
          const databaseName = getChatDatabase();
          const row = findRow(id);
          if (!row) throw new Error("对话还没有保存下来，暂时不能修改历史");
          const outcome = await piSessionEdit({ sessionFile: row.sessionFile, databaseName }, edit);
          if (!outcome.ok || !outcome.messages) {
            throw new Error(outcome.error ?? "修改对话历史失败");
          }
          const messages = outcome.messages;
          // 切版本/回退改变了当前路径：目录行的消息数跟着当前路径走（时间不动，只是换了个视角）
          const messageCount = messages.filter(message => message.role === "user").length;
          if (messageCount !== row.messageCount) {
            await patchRow(id, { messageCount, updateTime: row.updateTime }, databaseName);
          }
          return messages;
        },

        createGroup: async (name, parentId) => {
          const group = await createChatGroup({ name, parentId });
          set(state => ({ groups: [...state.groups, group] }));
          return group;
        },

        renameGroup: async (id, name) => {
          const group = await updateChatGroup({ id, name });
          set(state => ({ groups: state.groups.map(item => (item.id === id ? group : item)) }));
          return group;
        },

        deleteGroup: async id => {
          await deleteChatGroup(id);
          // 主进程已把该组对话移到未分组：本地同步
          set(state => {
            const buckets: Record<string, ChatBucket> = {};
            for (const [key, bucket] of Object.entries(state.buckets)) {
              buckets[key] = {
                ...bucket,
                rows: bucket.rows.map(row =>
                  row.groupId === id ? { ...row, groupId: null } : row
                ),
              };
            }
            return { buckets, groups: state.groups.filter(group => group.id !== id) };
          });
        },
      };
    },
    {
      name: "chat-session",
      partialize: state => ({ currentIds: state.currentIds }),
      merge: (persisted, current) => {
        const saved = (persisted as { currentIds?: Record<string, unknown> } | undefined)
          ?.currentIds;
        const currentIds: Record<string, string | null> = {};
        for (const [key, value] of Object.entries(saved ?? {})) {
          // 旧版本存的是自增 number id，切换后没有意义，丢弃
          if (typeof value === "string") currentIds[key] = value;
        }
        return { ...current, currentIds };
      },
    }
  )
);

export default useChatSessionStore;

/** 某列表的目录行（订阅用；稳定空数组避免无谓重渲染） */
const EMPTY_ROWS: ChatSessionRow[] = [];
export const selectRows = (bucket: ChatBucketRef) => (state: ChatSessionState) =>
  state.buckets[bucketKeyOf(bucket)]?.rows ?? EMPTY_ROWS;

export const selectBucketStatus = (bucket: ChatBucketRef) => (state: ChatSessionState) =>
  state.buckets[bucketKeyOf(bucket)]?.status ?? ChatBucketStatus.UN_INIT;

export const MAIN_CHAT_BUCKET: ChatBucketRef = { scope: "main-chat", domainRef: null };

/** 已登记的对话才有会话文件；草稿没有（首轮发送后才登记） */
export const isDraftChat = (chat: Pick<ChatMessage, "sessionFile">): boolean => !chat.sessionFile;

/**
 * 新对话草稿槽（模块级，不进 store 状态——渲染期取草稿不能触发 setState）。
 * 每个面板一个槽（停靠栏与对话页同属主聊天，但各自有自己的新对话）；草稿首轮登记后
 * 从槽里摘掉，下次「新对话」拿到的是新 id。
 */
const draftSlots = new Map<string, ChatMessage>();

export const draftFor = (slot: string, bucket: ChatBucketRef): ChatMessage => {
  let draft = draftSlots.get(slot);
  if (!draft) {
    draft = createDraftChat(bucket);
    draftSlots.set(slot, draft);
  }
  return draft;
};

/** 丢掉槽里的草稿（点「新对话」时：下次取到的是新 id） */
export const resetDraft = (slot: string): void => {
  draftSlots.delete(slot);
};

/** 草稿已登记为正式对话：从所有槽里摘掉 */
export const releaseDraft = (id: string): void => {
  for (const [slot, draft] of draftSlots) if (draft.id === id) draftSlots.delete(slot);
};

/** 设置里的新对话默认工作目录（空 = 应用数据目录） */
const defaultChatCwd = (): string =>
  useSettingStore.getState().setting.agentWorkspace?.defaultCwd?.trim() ?? "";

const chatCwdIn = (state: ChatSessionState, id: string): string | undefined => {
  for (const bucket of Object.values(state.buckets)) {
    const row = bucket.rows.find(item => item.id === id);
    if (row) return row.cwd || undefined;
  }
  return state.draftCwds[id];
};

/**
 * 主对话的工作目录：目录行登记的 → 草稿选的 → 设置默认。空串交主进程落到应用数据目录。
 * 早于本功能登记的对话目录行为空，跟随默认。
 */
export const resolveChatCwd = (id: string): string =>
  chatCwdIn(useChatSessionStore.getState(), id) ?? defaultChatCwd();

/** 订阅版 resolveChatCwd（对话栏展示用） */
export const useChatCwd = (id: string): string => {
  const own = useChatSessionStore(state => chatCwdIn(state, id));
  const fallback = useSettingStore(state => state.setting.agentWorkspace?.defaultCwd?.trim() ?? "");
  return own ?? fallback;
};
