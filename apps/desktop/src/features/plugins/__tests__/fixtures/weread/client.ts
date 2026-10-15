import type { JsonValue, PluginContext } from "@tau/plugins";

export interface NotebookSummary {
  id: string;
  title: string;
  author: string;
  notes: number;
}
export interface NotebookPage {
  books: NotebookSummary[];
  next: number | null;
}

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("微信读书返回的数据格式无效");
  return value;
}
function text(value: JsonValue | undefined): string {
  if (typeof value !== "string") throw new Error("微信读书书籍字段格式无效");
  return value;
}
function count(value: JsonValue | undefined): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("微信读书笔记数量格式无效");
  return value;
}

export async function loadNotebookPage(
  context: PluginContext,
  getApiKey: () => string,
  cursor: number | null,
  signal: AbortSignal
): Promise<NotebookPage> {
  const key = getApiKey();
  if (!key) throw new Error("请先在账号与连接中配置微信读书 API Key");
  if (/[\r\n]/.test(key)) throw new Error("API Key 格式无效，请检查账号与连接配置");
  const response = await context.fetch("https://i.weread.qq.com/api/agent/gateway", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      api_name: "/user/notebooks",
      skill_version: "1.0.4",
      count: 100,
      ...(cursor === null ? {} : { lastSort: cursor }),
    }),
  });
  if (!response.ok) await response.body?.cancel();
  if (response.status === 401 || response.status === 403)
    throw new Error("微信读书连接已失效，请在账号与连接中重新配置");
  if (response.status === 429 || response.status === 499)
    throw new Error("微信读书请求过快，请稍后重试");
  if (response.status < 200 || response.status >= 300)
    throw new Error(`微信读书请求失败（HTTP ${response.status}）`);
  const data = record(await response.json());
  if (getApiKey() !== key) throw new Error("账号配置已变化，请重新读取书单");
  if (data.errcode === -2011 || data.errcode === -2012)
    throw new Error("微信读书连接已失效，请在账号与连接中重新配置");
  if (data.errcode === -10102) throw new Error("微信读书请求过快，请稍后重试");
  if (data.errcode !== undefined && data.errcode !== 0)
    throw new Error("微信读书未能完成请求，请检查连接后重试");
  if (!Array.isArray(data.books)) throw new Error("微信读书未返回笔记书单");
  const books = data.books.map(item => {
    const entry = record(item),
      book = record(entry.book);
    return {
      id: text(entry.bookId),
      title: text(book.title),
      author: text(book.author),
      notes: count(entry.noteCount) + count(entry.reviewCount),
    };
  });
  let next: number | null = null;
  if (data.hasMore === 1) {
    const last = record(data.books.at(-1));
    if (
      typeof last.sort !== "number" ||
      !Number.isFinite(last.sort) ||
      last.sort < 0 ||
      (cursor !== null && last.sort >= cursor)
    )
      throw new Error("微信读书分页游标未前进，请重新读取书单");
    next = last.sort;
  }
  return { books, next };
}
