// @vitest-environment node
import { expect, it, vi } from "vitest";
import * as Y from "yjs";
import { WhiteboardModel, createWhiteboardDocument } from "@tau/collaboration";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import { prepareUnshareCandidate } from "../unshare";

const HOSTED = "tau-collab-asset:11111111-1111-4111-8111-111111111111";
const FOREIGN = "tau-collab-local:22222222-2222-4222-8222-222222222222";

async function sharedState() {
  const source = new Y.Doc(),
    model = new WhiteboardModel(source);
  const contract = await prepareWhiteboardContract("missing.plugin", {
    type: "missing.photo",
    dataVersion: 1,
    resources: [{ path: "image", kind: "image" }],
  });
  await model.installContracts({ [contract.id]: contract.contract });
  const page = model.submit([{ type: "create_page", title: "页" }], null).createdIds[0];
  const geometry = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
  for (const image of [HOSTED, FOREIGN])
    model.submit(
      [
        {
          type: "create",
          contractId: contract.id,
          data: { image, note: "原样" },
          geometry,
          parent: { kind: "page", id: page },
        },
      ],
      null
    );
  const shared = await createWhiteboardDocument(
    { documentId: "room", baselineId: "base", epoch: 0 },
    Y.encodeStateAsUpdate(source)
  );
  model.dispose();
  source.destroy();
  try {
    return Y.encodeStateAsUpdate(shared);
  } finally {
    shared.destroy();
  }
}
const read = (candidate: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, candidate);
  const model = new WhiteboardModel(doc);
  try {
    return {
      meta: doc.share.has("meta") ? doc.getMap("meta").toJSON() : null,
      images: model.read().pages[0].children.map(node => (node.data as { image: string }).image),
      notes: model.read().pages[0].children.map(node => (node.data as { note: string }).note),
    };
  } finally {
    model.dispose();
    doc.destroy();
  }
};

it("结束共享时托管图片转存为本机引用；他人设备的本机文件取不到时保留原引用并计为缺失", async () => {
  const local = await sharedState();
  const assets = {
    readTransferFile: vi.fn(async (url: string, documentId: string, reference: string) => {
      if (reference !== HOSTED || url !== "https://collab.test" || documentId !== "room")
        throw new Error("资源仅在分享者本机可用");
      return { name: "a.png", mime: "image/png", bytes: new Uint8Array([1]) };
    }),
    keepLocalFile: vi.fn(async (documentId: string) => {
      expect(documentId).toBe("local-doc");
      return "tau-collab-local:33333333-3333-4333-8333-333333333333";
    }),
  };
  const result = await prepareUnshareCandidate(
    {
      local,
      documentId: "local-doc",
      roomId: "room",
      serverUrl: "https://collab.test",
      mode: "close",
    },
    assets as never
  );
  expect(result.missing).toEqual([FOREIGN]);
  const candidate = read(result.candidate);
  expect(candidate.meta).toBeNull();
  expect(candidate.images).toEqual([
    "tau-collab-local:33333333-3333-4333-8333-333333333333",
    FOREIGN,
  ]);
  // 未安装插件的元素载荷原样保留。
  expect(candidate.notes).toEqual(["原样", "原样"]);
});

it("仍有权限时托管图片下载失败则不结束共享；权限已失去时只用本机缓存并记录缺失", async () => {
  const local = await sharedState();
  const failing = {
    readTransferFile: vi.fn(async () => {
      throw new Error("网络中断");
    }),
    keepLocalFile: vi.fn(),
  };
  await expect(
    prepareUnshareCandidate(
      {
        local,
        documentId: "local-doc",
        roomId: "room",
        serverUrl: "https://collab.test",
        mode: "close",
      },
      failing as never
    )
  ).rejects.toThrow("图片下载失败，共享没有结束");
  const detached = await prepareUnshareCandidate(
    {
      local,
      documentId: "local-doc",
      roomId: "room",
      serverUrl: "https://collab.test",
      mode: "detach",
    },
    failing as never
  );
  expect(failing.readTransferFile).toHaveBeenLastCalledWith("", "room", FOREIGN);
  expect(failing.readTransferFile).toHaveBeenCalledWith("", "room", HOSTED);
  expect(detached.missing).toEqual([HOSTED, FOREIGN]);
  expect(read(detached.candidate).images).toEqual([HOSTED, FOREIGN]);
});
