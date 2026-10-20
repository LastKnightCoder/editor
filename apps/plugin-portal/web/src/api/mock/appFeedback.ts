import type {
  AppFeedbackDetail,
  AppFeedbackStatus,
  AppFeedbackSummary,
} from "../../../../contracts";
import { PortalApiError } from "../errors";
import type { PortalApi } from "../types";

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

function sample(
  id: string,
  partial: Partial<AppFeedbackDetail> & Pick<AppFeedbackDetail, "kind" | "message">
): AppFeedbackDetail {
  const createdAt = partial.createdAt ?? hoursAgo(1);
  return {
    id,
    status: "new",
    visitorId: "3f9a1c2e-visitor",
    appVersion: "0.59.0",
    platform: "darwin",
    imageCount: 0,
    hasLogs: false,
    contact: null,
    context: { appVersion: "0.59.0", platform: "darwin", osVersion: "15.4", arch: "arm64" },
    note: "",
    revision: 0,
    attachments: [],
    updatedAt: createdAt,
    createdAt,
    ...partial,
  };
}

const SCREENSHOT = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
<rect width="960" height="600" fill="#f3eee2"/><rect x="230" y="40" width="700" height="530" rx="12" fill="#fffdf9"/>
<rect x="30" y="60" width="150" height="14" rx="7" fill="#e0d6c3"/><rect x="30" y="96" width="120" height="14" rx="7" fill="#e0d6c3"/>
<rect x="270" y="90" width="260" height="22" rx="8" fill="#e0d6c3"/><rect x="270" y="380" width="250" height="120" rx="10" fill="#efe4d3"/>
<rect x="560" y="380" width="250" height="120" rx="10" fill="#efe4d3"/><rect x="260" y="370" width="340" height="140" fill="none" stroke="#b0564d" stroke-width="4" rx="6"/>
</svg>`;

/** 模拟模式的用户反馈：几条覆盖不同类型与附件组合的样例 */
export function createAppFeedbackMock(): Pick<
  PortalApi,
  "listAppFeedback" | "getAppFeedback" | "updateAppFeedback" | "getAppFeedbackAttachment"
> {
  const rows = new Map<string, AppFeedbackDetail>(
    [
      sample("fb-1", {
        kind: "bug",
        message:
          "白板里拖动卡片时偶尔会卡住，松手后卡片弹回原来的位置。卡片多（大概 200 张以上）的时候更容易出现。",
        createdAt: hoursAgo(0.2),
        imageCount: 2,
        hasLogs: true,
        context: {
          appVersion: "0.59.0",
          platform: "darwin",
          osVersion: "15.4",
          arch: "arm64",
          page: "whiteboard",
          theme: "paper · light",
          locale: "zh-CN",
        },
        attachments: [
          { id: "a1", kind: "image", mime: "image/webp", size: 212_000 },
          { id: "a2", kind: "image", mime: "image/webp", size: 186_000 },
          { id: "a3", kind: "log", mime: "application/gzip", size: 48_000 },
          { id: "a4", kind: "perf", mime: "application/gzip", size: 96_000 },
        ],
      }),
      sample("fb-2", {
        kind: "idea",
        message: "希望闪卡复习能设置每日上限，积压太多的时候打开就很劝退。",
        createdAt: hoursAgo(1),
        platform: "win32",
        context: { appVersion: "0.59.0", platform: "win32" },
        contact: "reader@example.com",
      }),
      sample("fb-3", {
        kind: "other",
        message: "界面很好看，用了一周了，谢谢作者。",
        status: "done",
        createdAt: hoursAgo(50),
      }),
    ].map(row => [row.id, row])
  );
  const get = (id: string) => {
    const row = rows.get(id);
    if (!row) throw new PortalApiError(404, "NOT_FOUND", "反馈不存在或已过期删除");
    return row;
  };
  const summary = (row: AppFeedbackDetail): AppFeedbackSummary => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    message: row.message,
    visitorId: row.visitorId,
    appVersion: row.appVersion,
    platform: row.platform,
    imageCount: row.imageCount,
    hasLogs: row.hasLogs,
    createdAt: row.createdAt,
  });
  return {
    listAppFeedback: async filter => {
      const scoped = [...rows.values()].filter(
        row =>
          (filter.kind === "all" || row.kind === filter.kind) &&
          (!filter.visitorId || row.visitorId === filter.visitorId)
      );
      const counts: Record<AppFeedbackStatus, number> = { new: 0, doing: 0, done: 0, ignored: 0 };
      for (const row of scoped) counts[row.status] += 1;
      return {
        items: scoped
          .filter(row => filter.status === "all" || row.status === filter.status)
          .map(summary),
        nextCursor: null,
        counts,
      };
    },
    getAppFeedback: async id => get(id),
    updateAppFeedback: async (id, input) => {
      const row = get(id);
      if (row.revision !== input.revision)
        throw new PortalApiError(409, "REVISION_CONFLICT", "这条反馈刚被更新过，请刷新后重试");
      const next = {
        ...row,
        status: input.status ?? row.status,
        note: input.note ?? row.note,
        revision: row.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      rows.set(id, next);
      return next;
    },
    getAppFeedbackAttachment: async (id, attachmentId) => {
      const attachment = get(id).attachments.find(item => item.id === attachmentId);
      if (!attachment) throw new PortalApiError(404, "NOT_FOUND", "附件不存在或已过期删除");
      return attachment.kind === "image"
        ? new Blob([SCREENSHOT], { type: "image/svg+xml" })
        : new Blob(["模拟日志"], { type: "application/gzip" });
    },
  };
}
