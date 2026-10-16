import { describe, expect, it } from "vitest";
import type { QuestionChat, QuestionEvent, QuestionMaterial } from "@/types";
import { buildQuestMaterials, buildQuestTrail } from "../publish-quest-research";

const DAY = 86_400_000;
const T0 = new Date(2026, 9, 1, 10).getTime();

const material = (patch: Partial<QuestionMaterial>): QuestionMaterial => ({
  id: 1,
  questionId: 1,
  targetType: "card",
  targetId: 1,
  sortIndex: 0,
  createTime: T0,
  title: "",
  excerpt: "",
  meta: "",
  words: 0,
  targetCreateTime: T0,
  contentId: null,
  projectId: null,
  boardContentId: null,
  missing: false,
  ...patch,
});

const chat = (patch: Partial<QuestionChat>): QuestionChat => ({
  id: 1,
  questionId: 1,
  sessionId: "s-1",
  messageIds: [],
  createTime: T0,
  title: "对话",
  scopeLabel: "",
  messageCount: 4,
  updateTime: T0,
  openable: true,
  missing: false,
  initiated: false,
  ...patch,
});

const event = (type: QuestionEvent["type"], payload: object, createTime: number): QuestionEvent =>
  ({ id: createTime, questionId: 1, type, payload, createTime }) as QuestionEvent;

describe("buildQuestMaterials", () => {
  const detail = {
    materials: [
      material({ targetType: "card", targetId: 7, title: "已公开卡片", excerpt: "摘要" }),
      material({ targetType: "card", targetId: 8, title: "未公开卡片" }),
      material({ targetType: "answer", targetId: 99, title: "独立答案" }),
      material({ targetType: "article", targetId: 3, title: "已删除文章", missing: true }),
      material({
        targetType: "web-clip",
        targetId: 5,
        title: "剪藏",
        material: {
          ref: { kind: "web-clip", id: 5 },
          title: "Write-Ahead Logging",
          meta: "sqlite.org",
          quote: "readers do not block writers",
          note: "",
          deleted: false,
          open: { page: "external-url", url: "https://sqlite.org/wal.html" },
        },
      }),
      material({
        targetType: "excerpt",
        targetId: 6,
        material: {
          ref: { kind: "excerpt", id: 6 },
          title: "读不阻塞写",
          meta: "微信读书 · 《DDIA》",
          quote: "读不阻塞写，写不阻塞读。",
          note: "关键原则",
          deleted: false,
          open: {
            page: "excerpt-provider",
            sourceType: "weread",
            sourceKey: "b",
            externalId: "b:1",
            label: "微信读书",
            url: null,
          },
        },
      }),
    ],
    chats: [
      chat({ sessionId: "s-2", missing: true }),
      chat({ sessionId: "s-1", title: "讨论 checkpoint" }),
    ],
  };
  const targets = { "card:7": { contentType: "card", refId: 7, href: "/cards/7.html" } };

  it("按外部资料 → 我的笔记 → 讨论编号，并跳过独立答案、已删除材料与对话", () => {
    const { materials } = buildQuestMaterials(detail, targets);
    expect(materials.map(m => [m.index, m.group, m.title])).toEqual([
      [1, "external", "Write-Ahead Logging"],
      [2, "external", "微信读书 · 《DDIA》"],
      [3, "note", "已公开卡片"],
      [4, "note", "未公开卡片"],
      [5, "discussion", "讨论 checkpoint"],
    ]);
  });

  it("已发布笔记给站内链接，剪藏给外部原处，划线保留引文与想法", () => {
    const { materials } = buildQuestMaterials(detail, targets);
    expect(materials[0]).toMatchObject({ url: "https://sqlite.org/wal.html", meta: "sqlite.org" });
    expect(materials[1]).toMatchObject({ excerpt: "读不阻塞写，写不阻塞读。", note: "关键原则" });
    expect(materials[1].url).toBeUndefined();
    expect(materials[2]).toMatchObject({ href: "/cards/7.html", citeKey: "card:7" });
    expect(materials[3].href).toBeUndefined();
    expect(materials[4]).toMatchObject({ kind: "chat-session", meta: "4 条消息" });
  });
});

describe("buildQuestTrail", () => {
  const indexByKey = new Map([
    ["web-clip:5", 1],
    ["excerpt:6", 2],
    ["card:7", 3],
    ["chat-session:s-1", 4],
  ]);

  it("同日关联合并为一行，产出记为里程碑，解除与自动状态变化不展示", () => {
    const trail = buildQuestTrail(
      [
        event("create", {}, T0),
        event("link", { targetType: "web-clip", targetId: 5 }, T0 + 1),
        event("status", { to: "in_progress", auto: true }, T0 + 1),
        event("link", { targetType: "excerpt", targetId: 6 }, T0 + 2),
        event("note", { text: "  一开始走错了方向  " }, T0 + DAY),
        event("link", { targetType: "card", targetId: 7, created: true }, T0 + DAY),
        event("link", { targetType: "card", targetId: 42 }, T0 + DAY),
        event("unlink", { targetType: "card", targetId: 42 }, T0 + DAY),
        event("link", { targetType: "chat-session", sessionId: "s-1" }, T0 + 2 * DAY),
        event("link", { targetType: "answer", targetId: 99, created: true }, T0 + 3 * DAY),
        event("status", { to: "resolved" }, T0 + 3 * DAY),
      ],
      indexByKey
    );
    expect(trail.map(({ tone, text, refs }) => [tone, text, refs])).toEqual([
      ["start", "提出问题", []],
      ["plain", "关联 2 份资料", [1, 2]],
      ["note", "一开始走错了方向", []],
      ["milestone", "写下卡片", [3]],
      ["plain", "关联对话", [4]],
      ["milestone", "写下解答", []],
      ["done", "标为已解决", []],
    ]);
  });
});
