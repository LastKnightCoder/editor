/**
 * 统一会话 store（M4）：草稿首发登记、改会话树、五个场景的分桶互不串。
 * 目录命令与 pi 会话命令都 mock，只测 store 的编排与状态。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSessionInsert, ChatSessionRow } from "@/types/chat-session";
import useChatSessionStore, {
  bucketOfChatScope,
  draftFor,
  isDraftChat,
  selectRows,
  type ChatBucketRef,
} from "../useChatSessionStore";
import { createChatSession, listChatSessions, updateChatSession } from "@/commands/chat-session";
import { piSessionEdit, piSessionTranscript } from "@/commands/piSession";

vi.mock("@/commands/chat-session", () => ({
  createChatSession: vi.fn(),
  deleteChatSession: vi.fn(),
  listChatSessions: vi.fn(),
  pinChatSession: vi.fn(),
  unpinChatSession: vi.fn(),
  updateChatSession: vi.fn(),
}));
vi.mock("@/commands/chat-message", () => ({
  createChatGroup: vi.fn(),
  deleteChatGroup: vi.fn(),
  getAllChatGroups: vi.fn().mockResolvedValue([]),
  updateChatGroup: vi.fn(),
}));
vi.mock("@/commands/piSession", () => ({
  piSessionEdit: vi.fn(),
  piSessionTranscript: vi.fn(),
}));

const row = (patch: Partial<ChatSessionRow> & Pick<ChatSessionRow, "id">): ChatSessionRow => ({
  scope: "main-chat",
  domainRef: null,
  sessionFile: `f_${patch.id}.jsonl`,
  cwd: "",
  title: "对话",
  titleDirty: false,
  groupId: null,
  orderNum: null,
  archived: false,
  source: "desktop",
  messageCount: 1,
  parentSessionId: null,
  branchIndex: 0,
  createTime: 1,
  updateTime: 1,
  ...patch,
});

/** createChatSession 按入参回一行（模拟主进程落库） */
const echoInsert = (input: ChatSessionInsert): Promise<ChatSessionRow> =>
  Promise.resolve(
    row({
      id: input.id,
      scope: input.scope,
      domainRef: input.domainRef ?? null,
      sessionFile: input.sessionFile,
      title: input.title ?? "新对话",
      titleDirty: input.titleDirty ?? false,
      groupId: input.groupId ?? null,
      messageCount: input.messageCount ?? 0,
    })
  );

const MAIN: ChatBucketRef = { scope: "main-chat", domainRef: null };
const PDF_12: ChatBucketRef = { scope: "pdf-chat", domainRef: "12" };
const PDF_13: ChatBucketRef = { scope: "pdf-chat", domainRef: "13" };
const VIDEO_12: ChatBucketRef = { scope: "video-note-chat", domainRef: "12" };

/** 按 scope + domainRef 过滤的假目录表 */
const seedCatalog = (rows: ChatSessionRow[]) => {
  vi.mocked(listChatSessions).mockImplementation(async filter =>
    rows.filter(
      item =>
        item.scope === filter?.scope &&
        (filter?.domainRef === undefined || item.domainRef === filter.domainRef)
    )
  );
};

const ids = (bucket: ChatBucketRef) =>
  selectRows(bucket)(useChatSessionStore.getState()).map(item => item.id);

beforeEach(() => {
  vi.clearAllMocks();
  useChatSessionStore.setState({ buckets: {}, currentIds: {}, opened: {}, groups: [] });
  vi.mocked(createChatSession).mockImplementation(echoInsert);
  seedCatalog([]);
});

describe("新对话首发登记", () => {
  it("草稿以原 id 登记目录行，会话文件名写回，草稿槽随即换新", async () => {
    await useChatSessionStore.getState().loadBucket(PDF_12);
    const draft = draftFor("dock|pdf-chat|12", PDF_12);
    expect(isDraftChat(draft)).toBe(true);

    const registered = await useChatSessionStore
      .getState()
      .registerChat({ ...draft, title: "读论文" }, "f_new.jsonl");

    expect(createChatSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: draft.id,
        scope: "pdf-chat",
        domainRef: "12",
        sessionFile: "f_new.jsonl",
        title: "读论文",
        messageCount: 0,
      })
    );
    expect(registered.id).toBe(draft.id);
    expect(ids(PDF_12)).toEqual([draft.id]);
    expect(isDraftChat(registered)).toBe(false);
    // 登记后槽里的草稿被摘掉：下次「新对话」拿到的是新 id
    expect(draftFor("dock|pdf-chat|12", PDF_12).id).not.toBe(draft.id);
  });

  it("已打开的草稿登记后同步成正式对话（带 sessionFile），消息保留", async () => {
    await useChatSessionStore.getState().loadBucket(MAIN);
    const draftId = useChatSessionStore.getState().openDraftInGroup(MAIN, 7);
    const draft = useChatSessionStore.getState().opened[draftId];
    const withMessage = {
      ...draft,
      messages: [{ role: "user", content: "你好" }] as unknown as typeof draft.messages,
    };
    useChatSessionStore.getState().publishChat(withMessage);

    await useChatSessionStore.getState().registerChat(withMessage, "f_g.jsonl");

    expect(createChatSession).toHaveBeenCalledWith(expect.objectContaining({ groupId: 7 }));
    const opened = useChatSessionStore.getState().opened[draftId];
    expect(opened.sessionFile).toBe("f_g.jsonl");
    expect(opened.messages).toHaveLength(1);
  });

  it("草稿还没登记时 settle 不读文件（首轮没等到回答 pi 不落盘）", async () => {
    const draft = draftFor("page|main-chat|", MAIN);
    expect(await useChatSessionStore.getState().settleChat(draft.id)).toBeNull();
    expect(piSessionTranscript).not.toHaveBeenCalled();
  });
});

describe("改会话树（M4-d：分支都在同一个对话文件里）", () => {
  it("按目录行的会话文件发 edit，返回投影；不新建对话", async () => {
    seedCatalog([row({ id: "p1", messageCount: 2 })]);
    await useChatSessionStore.getState().loadBucket(MAIN);
    const projectedMessages = [
      { clientId: "pi:e1", role: "user", content: "你好" },
      { clientId: "pi:e2", role: "assistant", content: "嗨" },
    ];
    vi.mocked(piSessionEdit).mockResolvedValue({ ok: true, messages: projectedMessages as never });

    const messages = await useChatSessionStore
      .getState()
      .editChat("p1", { kind: "switch", entryId: "e1" });

    expect(piSessionEdit).toHaveBeenCalledWith(
      { sessionFile: "f_p1.jsonl" },
      { kind: "switch", entryId: "e1" }
    );
    expect(messages).toEqual(projectedMessages);
    expect(createChatSession).not.toHaveBeenCalled();
    expect(ids(MAIN)).toEqual(["p1"]);
  });

  it("切到的路径更短/更长：目录行消息数跟着当前路径，更新时间不动", async () => {
    seedCatalog([row({ id: "p1", messageCount: 2, updateTime: 77 })]);
    await useChatSessionStore.getState().loadBucket(MAIN);
    vi.mocked(piSessionEdit).mockResolvedValue({
      ok: true,
      messages: [{ role: "user", content: "只剩一问" }] as never,
    });
    vi.mocked(updateChatSession).mockResolvedValue(null);

    await useChatSessionStore.getState().editChat("p1", { kind: "rewind", entryId: "e3" });

    expect(updateChatSession).toHaveBeenCalledWith("p1", { messageCount: 1, updateTime: 77 });
  });

  it("主进程拒绝（回答进行中）时抛错，调用方提示", async () => {
    seedCatalog([row({ id: "p1" })]);
    await useChatSessionStore.getState().loadBucket(MAIN);
    vi.mocked(piSessionEdit).mockResolvedValue({ ok: false, error: "回答进行中" });
    await expect(
      useChatSessionStore.getState().editChat("p1", { kind: "omit", entryIds: ["e1"] })
    ).rejects.toThrow("回答进行中");
  });

  it("草稿（还没登记）不能改历史", async () => {
    await useChatSessionStore.getState().loadBucket(MAIN);
    const draft = draftFor("page|main-chat|", MAIN);
    await expect(
      useChatSessionStore.getState().editChat(draft.id, { kind: "fork", entryId: "e1" })
    ).rejects.toThrow();
    expect(piSessionEdit).not.toHaveBeenCalled();
  });
});

describe("五个场景分桶", () => {
  it("同 scope 不同对象、同对象不同 scope 各是一个列表，互不串", async () => {
    seedCatalog([
      row({ id: "m1" }),
      row({ id: "p12", scope: "pdf-chat", domainRef: "12" }),
      row({ id: "p13", scope: "pdf-chat", domainRef: "13" }),
      row({ id: "v12", scope: "video-note-chat", domainRef: "12" }),
    ]);
    const store = useChatSessionStore.getState();
    await Promise.all([MAIN, PDF_12, PDF_13, VIDEO_12].map(bucket => store.loadBucket(bucket)));

    expect(ids(MAIN)).toEqual(["m1"]);
    expect(ids(PDF_12)).toEqual(["p12"]);
    expect(ids(PDF_13)).toEqual(["p13"]);
    expect(ids(VIDEO_12)).toEqual(["v12"]);
    expect(listChatSessions).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "main-chat", domainRef: null })
    );
  });

  it("登记只进自己的桶；当前选中按桶记", async () => {
    const store = useChatSessionStore.getState();
    await Promise.all([PDF_12, PDF_13].map(bucket => store.loadBucket(bucket)));

    const draft = draftFor("dock|pdf-chat|13", PDF_13);
    await store.registerChat(draft, "f_13.jsonl");
    store.setCurrent(PDF_13, draft.id);

    expect(ids(PDF_13)).toEqual([draft.id]);
    expect(ids(PDF_12)).toEqual([]);
    expect(useChatSessionStore.getState().currentIds).toEqual({ "pdf-chat|13": draft.id });
  });

  it("同场景不同面板的草稿各有各的槽", () => {
    const dock = draftFor("dock|main-chat|", MAIN);
    const page = draftFor("page|main-chat|", MAIN);
    expect(dock.id).not.toBe(page.id);
    expect(draftFor("dock|main-chat|", MAIN)).toBe(dock);
  });

  it("chatScope 解析出分桶（domainRef 可含冒号）", () => {
    expect(bucketOfChatScope("main-chat")).toEqual(MAIN);
    expect(bucketOfChatScope("pdf-chat:12")).toEqual(PDF_12);
    expect(bucketOfChatScope("vibe-learning-chat:a:b")).toEqual({
      scope: "vibe-learning-chat",
      domainRef: "a:b",
    });
  });
});
