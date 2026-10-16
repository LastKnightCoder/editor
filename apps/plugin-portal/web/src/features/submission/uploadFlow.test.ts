import { describe, expect, it, vi } from "vitest";
import type { Upload } from "../../../../contracts";
import { PortalApiError, networkError } from "../../api/errors";
import { createMockApi, memoryStorage } from "../../api/mock/mockApi";
import type { PortalApi } from "../../api/types";
import { confirmUpload, runUpload, type UploadPhase } from "./uploadFlow";

const TIMING = { latencyMs: 0, uploadMs: 40, verifyMs: 60 };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function setup(
  flags: Parameters<ReturnType<typeof createMockApi>["controller"]["setFlags"]>[0] = {}
) {
  const mock = createMockApi({ storage: memoryStorage(), timing: TIMING });
  mock.controller.setFlags(flags);
  return mock;
}

const zip = (name = "demo-plugin-1.0.0.zip") =>
  new File([new Uint8Array(1000)], name, { type: "application/zip" });

describe("上传流程", () => {
  it.each(["UPLOAD_STATE_CONFLICT", "UPLOAD_EXPIRED"] as const)(
    "%s 按确定的语义处理",
    async code => {
      const ready: Upload = {
        id: "u1",
        kind: "icon",
        status: "ready",
        fileName: "i.png",
        size: 1,
        sha256: "x",
        manifest: null,
        error: null,
        createdAt: "",
      };
      const api = {
        createUpload: async () => ({ upload: ready, uploadUrl: "/x", method: "PUT", headers: {} }),
        sendUpload: () => ({
          result: Promise.reject(new PortalApiError(409, code, "请重新上传")),
          abort: () => {},
        }),
        getUpload: vi.fn(async () => ready),
      } as unknown as PortalApi;
      const outcome = await runUpload(api, "icon", new File(["x"], "i.png"), {
        signal: new AbortController().signal,
        onPhase: () => {},
      });
      if (code === "UPLOAD_STATE_CONFLICT") {
        expect(outcome.type).toBe("ready");
        expect(api.getUpload).toHaveBeenCalledOnce();
      } else {
        expect(outcome.type).toBe("failed");
        expect(api.getUpload).not.toHaveBeenCalled();
      }
    }
  );
  it("上传中 → 字节发完显示校验中 → 校验通过", async () => {
    const { api } = setup();
    const phases: UploadPhase["phase"][] = [];
    const outcome = await runUpload(api, "package", zip(), {
      signal: new AbortController().signal,
      onPhase: phase => phases.push(phase.phase),
    });
    expect(outcome).toMatchObject({
      type: "ready",
      upload: { status: "ready", manifest: { id: "demo-plugin", version: "1.0.0" } },
    });
    expect(phases[0]).toBe("preparing");
    expect(phases).toContain("uploading");
    expect(phases.at(-1)).toBe("verifying");
  });

  it("包校验失败显示服务端 message", async () => {
    const { api } = setup();
    const outcome = await runUpload(api, "package", zip("bad-plugin-1.0.0.zip"), {
      signal: new AbortController().signal,
      onPhase: () => {},
    });
    expect(outcome.type).toBe("invalid");
    expect(outcome.type === "invalid" && outcome.message).toMatch(/manifest/);
  });

  it("字节未发完时取消：核对为已取消", async () => {
    const { api } = setup();
    const controller = new AbortController();
    const outcome = await runUpload(api, "package", zip(), {
      signal: controller.signal,
      onPhase: phase => {
        if (phase.phase === "uploading") controller.abort();
      },
    });
    expect(outcome).toEqual({ type: "canceled" });
  });

  it("校验中取消：服务端仍在处理 → 待核对；稍后核对为「取消前已完成」", async () => {
    const { api } = setup();
    const controller = new AbortController();
    const outcome = await runUpload(api, "package", zip(), {
      signal: controller.signal,
      onPhase: phase => {
        if (phase.phase === "verifying") controller.abort();
      },
    });
    expect(outcome).toMatchObject({ type: "pending", reason: "canceled" });
    await sleep(TIMING.verifyMs + 20);
    const later = await confirmUpload(api, (outcome as { uploadId: string }).uploadId, "canceled");
    expect(later).toMatchObject({ type: "canceled-ready", upload: { status: "ready" } });
  });

  it("网络中断：读取核对，服务端未收到则判为失败", async () => {
    const { api } = setup({ upload: "network" });
    const outcome = await runUpload(api, "package", zip(), {
      signal: new AbortController().signal,
      onPhase: () => {},
    });
    expect(outcome).toMatchObject({ type: "failed", message: expect.stringMatching(/没有完成/) });
  });

  it("网络中断但服务端已完成：核对后按成功处理", async () => {
    const ready: Upload = {
      id: "u1",
      kind: "icon",
      status: "ready",
      fileName: "i.png",
      size: 1,
      sha256: "x",
      manifest: null,
      error: null,
      createdAt: "",
    };
    const api = {
      createUpload: async () => ({
        upload: { ...ready, status: "awaiting_upload" },
        uploadUrl: "/x",
        method: "PUT",
        headers: {},
      }),
      sendUpload: () => ({ result: Promise.reject(networkError()), abort: () => {} }),
      getUpload: vi.fn(async () => ready),
    } as unknown as PortalApi;
    const outcome = await runUpload(api, "icon", new File(["x"], "i.png"), {
      signal: new AbortController().signal,
      onPhase: () => {},
    });
    expect(outcome).toEqual({ type: "ready", upload: ready });
  });

  it("无法读取上传状态时保留 ID 供重新核对", async () => {
    const api = {
      createUpload: async () => ({
        upload: { id: "u2" },
        uploadUrl: "/x",
        method: "PUT",
        headers: {},
      }),
      sendUpload: () => ({ result: Promise.reject(networkError()), abort: () => {} }),
      getUpload: async () => {
        throw networkError();
      },
    } as unknown as PortalApi;
    const outcome = await runUpload(api, "icon", new File(["x"], "i.png"), {
      signal: new AbortController().signal,
      onPhase: () => {},
    });
    expect(outcome).toMatchObject({ type: "unconfirmed", uploadId: "u2", reason: "unknown" });
  });

  it("超限等确定性错误直接失败", async () => {
    const api = {
      createUpload: async () => {
        throw new PortalApiError(413, "UPLOAD_TOO_LARGE", "文件超过大小上限");
      },
    } as unknown as PortalApi;
    const outcome = await runUpload(api, "icon", new File(["x"], "i.png"), {
      signal: new AbortController().signal,
      onPhase: () => {},
    });
    expect(outcome).toEqual({ type: "failed", message: "文件超过大小上限" });
  });
});
