import { beforeEach, describe, expect, it, vi } from "vitest";

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const mockContext = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/electron", () => ({
  invoke: mockContext.invoke,
}));

const loadWereadCommands = async () => {
  vi.resetModules();
  return import("../weread");
};

describe("commands/weread", () => {
  beforeEach(() => {
    mockContext.invoke.mockReset();
  });

  it("首次调用时应先初始化 weread 模块再执行 IPC", async () => {
    const response = {
      status: 200,
      ok: true,
      data: { errcode: 0 },
      cookies: [],
    };

    mockContext.invoke
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(response);

    const { weReadHttpRequest } = await loadWereadCommands();

    await expect(
      weReadHttpRequest({
        path: "/web/user",
        method: "GET",
      }),
    ).resolves.toEqual(response);

    expect(mockContext.invoke).toHaveBeenNthCalledWith(
      1,
      "module-init:init-module",
      "weread",
    );
    expect(mockContext.invoke).toHaveBeenNthCalledWith(
      2,
      "weread:http-request",
      {
        path: "/web/user",
        method: "GET",
      },
    );
  });

  it("并发调用应共享同一个 weread 模块初始化过程", async () => {
    const initDeferred = createDeferred<{ success: boolean }>();

    mockContext.invoke.mockImplementation((channel: string) => {
      if (channel === "module-init:init-module") {
        return initDeferred.promise;
      }
      if (channel === "weread:http-request") {
        return Promise.resolve({
          status: 200,
          ok: true,
          data: { errcode: 0 },
          cookies: [],
        });
      }
      if (channel === "weread:get-all-notebooks") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`unexpected channel: ${channel}`));
    });

    const { getAllWeReadNotebooks, weReadHttpRequest } =
      await loadWereadCommands();

    const requestPromise = weReadHttpRequest({
      path: "/web/user",
      method: "GET",
    });
    const notebooksPromise = getAllWeReadNotebooks();

    expect(mockContext.invoke).toHaveBeenCalledTimes(1);
    expect(mockContext.invoke).toHaveBeenCalledWith(
      "module-init:init-module",
      "weread",
    );

    initDeferred.resolve({ success: true });

    await expect(requestPromise).resolves.toMatchObject({
      status: 200,
      ok: true,
    });
    await expect(notebooksPromise).resolves.toEqual([]);

    expect(
      mockContext.invoke.mock.calls.filter(
        ([channel]) => channel === "module-init:init-module",
      ),
    ).toHaveLength(1);
  });

  it("初始化失败后下次调用应重新尝试初始化", async () => {
    mockContext.invoke
      .mockResolvedValueOnce({ success: false, error: "初始化失败" })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce([]);

    const { getAllWeReadNotebooks } = await loadWereadCommands();

    await expect(getAllWeReadNotebooks()).rejects.toThrow("初始化失败");

    await expect(getAllWeReadNotebooks()).resolves.toEqual([]);

    expect(
      mockContext.invoke.mock.calls.filter(
        ([channel]) => channel === "module-init:init-module",
      ),
    ).toHaveLength(2);
  });
});
