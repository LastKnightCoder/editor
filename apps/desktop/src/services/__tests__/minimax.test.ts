import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyMinimaxApiKey } from "@/services/minimax";

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

describe("services/minimax verifyMinimaxApiKey", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("get_voice 探测成功即视为 Key 有效，请求带 Bearer 鉴权且只拉系统音色", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ base_resp: { status_code: 0, status_msg: "success" }, system_voice: [] })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyMinimaxApiKey("ej-xxx")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.minimaxi.com/v1/get_voice");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer ej-xxx" });
    expect(JSON.parse(init.body as string)).toEqual({ voice_type: "system" });
  });

  it("base_resp 业务错误（如 1004 无效 Key）应抛错并带上 status_msg", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ base_resp: { status_code: 1004, status_msg: "invalid api key" } })
        )
    );

    await expect(verifyMinimaxApiKey("bad-key")).rejects.toThrow("invalid api key");
  });

  it("HTTP 层非 2xx（如 401）应抛错并带上状态码", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401)));

    await expect(verifyMinimaxApiKey("bad-key")).rejects.toThrow("401");
  });
});
