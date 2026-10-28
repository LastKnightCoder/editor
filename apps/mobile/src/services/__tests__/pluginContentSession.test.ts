import { expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import * as Y from "yjs";
import { createNodeDocument, readNodeDocument } from "@tau/collaboration";
import { createHash } from "node:crypto";
import { writePluginSharedContent } from "../pluginContentSession";
import { collaborationManager } from "../../features/collaboration/core/manager";
import { request } from "../../features/collaboration/core/rest";
vi.mock("../../features/collaboration/core/manager", () => ({
  collaborationManager: {
    session: vi.fn(),
    openDocument: vi.fn(),
    flushCache: vi.fn(),
    project: vi.fn(),
  },
}));
vi.mock("../../features/collaboration/core/rest", () => ({ request: vi.fn() }));

it("服务端修订冲突不会改写正在编辑的 Y.Doc", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const doc = await createNodeDocument(
    { documentId: "shared", baselineId: "baseline", epoch: 0 },
    { title: "", content: [], bannerBg: "", bannerPosition: "center" },
    {}
  );
  const session = {
    doc,
    info: { status: "active", serverUrl: "https://example.com", role: "owner" },
  };
  vi.mocked(collaborationManager.session).mockReturnValue(
    session as ReturnType<typeof collaborationManager.session>
  );
  vi.mocked(request).mockResolvedValue({ revision: "changed", sequence: 1 });
  const original = Y.encodeStateAsUpdate(doc);
  const revision = createHash("sha256").update(original).digest("hex");
  try {
    await expect(
      writePluginSharedContent("shared", [], {}, revision, async () => undefined)
    ).rejects.toMatchObject({ name: "PluginConflictError" });
    expect(Y.encodeStateAsUpdate(doc)).toEqual(original);
    expect(readNodeDocument(doc).content).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(collaborationManager.project).not.toHaveBeenCalled();
  } finally {
    doc.destroy();
    vi.unstubAllGlobals();
  }
});

it("确认提交后才合并候选，并刷新缓存和协作投影", async () => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  const { prepareContentContract } = await import("@tau/db-schema/content-contracts");
  const prepared = await prepareContentContract("host.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const contracts = { [prepared.id]: prepared.contract };
  const doc = await createNodeDocument(
    { documentId: "shared", baselineId: "baseline", epoch: 0 },
    { title: "", content: [], bannerBg: "", bannerPosition: "center" },
    {}
  );
  const session = {
    doc,
    info: { status: "active", serverUrl: "https://example.com", role: "owner" },
  };
  vi.mocked(collaborationManager.session).mockReturnValue(
    session as ReturnType<typeof collaborationManager.session>
  );
  const revision = createHash("sha256").update(Y.encodeStateAsUpdate(doc)).digest("hex");
  vi.mocked(request).mockImplementation(async input => {
    if (input.path.endsWith("/protocol")) return { revision, sequence: 1 } as never;
    expect(readNodeDocument(doc).content).toEqual([]);
    return { operation: { state: "COMMITTED", baselineId: "baseline", epoch: 0 } } as never;
  });
  try {
    const next = [
      {
        type: "paragraph",
        collabId: "new",
        tauContract: prepared.id,
        children: [{ type: "formatted", text: "追加" }],
      },
    ];
    const result = await writePluginSharedContent(
      "shared",
      next,
      contracts,
      revision,
      async () => undefined
    );
    expect(result).not.toBe(revision);
    expect(readNodeDocument(doc).content[0].children).toEqual(next[0].children);
    expect(collaborationManager.flushCache).toHaveBeenCalledWith("shared");
    expect(collaborationManager.project).toHaveBeenCalledWith("shared", undefined);
  } finally {
    doc.destroy();
    vi.unstubAllGlobals();
  }
});
