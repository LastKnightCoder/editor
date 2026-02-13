import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGithubRepoSelector } from "../useGithubRepoSelector";
import * as tauri from "../../../../services/tauri";

vi.mock("../../../../services/tauri", () => ({
  listGithubRepos: vi.fn(),
  listGithubBranches: vi.fn(),
}));

type SelectorParams = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
};

type SelectorSnapshot = ReturnType<typeof useGithubRepoSelector>;

function deferred<T>() {
  let resolve: ((value: T) => void) | null = null;
  let reject: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: (value: T) => {
      resolve?.(value);
    },
    reject: (reason?: unknown) => {
      reject?.(reason);
    },
  };
}

function HookHarness(props: {
  params: SelectorParams;
  onSnapshot: (value: SelectorSnapshot) => void;
}) {
  const snapshot = useGithubRepoSelector(props.params);
  props.onSnapshot(snapshot);
  return null;
}

type HookController = {
  render: (params: SelectorParams) => Promise<void>;
  latest: () => SelectorSnapshot | null;
  cleanup: () => Promise<void>;
};

function createHookController(): HookController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  let latestSnapshot: SelectorSnapshot | null = null;

  return {
    render: async (params) => {
      await act(async () => {
        root.render(
          <HookHarness
            params={params}
            onSnapshot={(value) => {
              latestSnapshot = value;
            }}
          />,
        );
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
    latest: () => latestSnapshot,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("useGithubRepoSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("token 与 owner 生效后会自动拉取仓库", async () => {
    const listReposMock = vi.mocked(tauri.listGithubRepos);
    const listBranchesMock = vi.mocked(tauri.listGithubBranches);
    listReposMock.mockResolvedValue(["repo-a", "repo-b"]);
    listBranchesMock.mockResolvedValue([]);

    const controller = createHookController();
    await controller.render({
      token: "",
      owner: "",
      repo: "",
      branch: "",
    });
    await controller.render({
      token: " token-1 ",
      owner: " owner-1 ",
      repo: "",
      branch: "",
    });

    expect(listReposMock).toHaveBeenCalledTimes(1);
    expect(listReposMock).toHaveBeenCalledWith("token-1", "owner-1");
    expect(controller.latest()?.repos).toEqual(["repo-a", "repo-b"]);
    await controller.cleanup();
  });

  it("repo 变化后会自动拉取对应分支", async () => {
    const listReposMock = vi.mocked(tauri.listGithubRepos);
    const listBranchesMock = vi.mocked(tauri.listGithubBranches);
    listReposMock.mockResolvedValue(["repo-a"]);
    listBranchesMock.mockResolvedValue(["main", "dev"]);

    const controller = createHookController();
    await controller.render({
      token: "token-1",
      owner: "owner-1",
      repo: "",
      branch: "",
    });
    listBranchesMock.mockClear();

    await controller.render({
      token: "token-1",
      owner: "owner-1",
      repo: "repo-a",
      branch: "",
    });

    expect(listBranchesMock).toHaveBeenCalledTimes(1);
    expect(listBranchesMock).toHaveBeenCalledWith(
      "token-1",
      "owner-1",
      "repo-a",
    );
    expect(controller.latest()?.branches).toEqual(["main", "dev"]);
    await controller.cleanup();
  });

  it("凭证失效时会清空仓库与分支并提示连接", async () => {
    const listReposMock = vi.mocked(tauri.listGithubRepos);
    const listBranchesMock = vi.mocked(tauri.listGithubBranches);
    listReposMock.mockResolvedValue(["repo-a"]);
    listBranchesMock.mockResolvedValue(["main"]);

    const controller = createHookController();
    await controller.render({
      token: "token-1",
      owner: "owner-1",
      repo: "repo-a",
      branch: "main",
    });

    expect(controller.latest()?.repos).toEqual(["repo-a"]);
    expect(controller.latest()?.branches).toEqual(["main"]);

    await controller.render({
      token: "",
      owner: "",
      repo: "repo-a",
      branch: "main",
    });

    expect(controller.latest()?.repos).toEqual([]);
    expect(controller.latest()?.branches).toEqual([]);
    expect(controller.latest()?.error).toBe("请先在集成账号中连接 Github");
    await controller.cleanup();
  });

  it("并发请求时仅保留最后一次仓库结果", async () => {
    const listReposMock = vi.mocked(tauri.listGithubRepos);
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    listReposMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const controller = createHookController();
    await controller.render({
      token: "token-1",
      owner: "owner-1",
      repo: "",
      branch: "",
    });
    await controller.render({
      token: "token-2",
      owner: "owner-2",
      repo: "",
      branch: "",
    });

    first.resolve(["repo-old"]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller.latest()?.repos).toEqual([]);

    second.resolve(["repo-new"]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller.latest()?.repos).toEqual(["repo-new"]);
    await controller.cleanup();
  });
});
