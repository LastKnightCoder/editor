import { expect, it, vi } from "vitest";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { createNodeDocument, bytesToBase64 } from "@tau/collaboration";
import * as Y from "yjs";
import {
  prepareDocumentResources,
  localizeDocumentResources,
  localizeFragmentResources,
  registerContentResourceSource,
} from "../core/resources";

const native = vi.hoisted(() => vi.fn());
const readCache = vi.hoisted(() => vi.fn());
vi.mock("../../../services/tauri", () => ({ collabResource: native, collabReadCache: readCache }));

it("跨正文粘贴核验来源并交接持久地址，来源离页后仍可读取耐久映射", async () => {
  const image = await prepareContentContract("tau.image", {
    type: "image",
    kind: "block",
    dataVersion: 1,
    isVoid: true,
    resources: [{ path: "url", kind: "image", preview: "previewUrl" }],
  });
  const contracts = { [image.id]: image.contract };
  const legacy = "tau-collab-local:11111111-1111-4111-8111-111111111111";
  const path = "~/.editor/resources/image.png";
  const content = [
    {
      type: "image",
      collabId: "image",
      tauContract: image.id,
      url: legacy,
      previewUrl: legacy,
      children: [{ text: "" }],
    },
  ];
  const doc = await createNodeDocument(
    { documentId: "body", baselineId: "base", epoch: 0 },
    { title: "", bannerBg: "", bannerPosition: "center", content },
    contracts
  );
  const release = registerContentResourceSource("local:library:body", {
    doc,
    localize: async references =>
      Object.fromEntries(references.map(reference => [reference, path])),
  });
  try {
    expect(
      (await localizeFragmentResources("local:library:body", content, contracts))[0]
    ).toMatchObject({ url: path, previewUrl: path });
    release();
    readCache.mockResolvedValue({
      metadata: {
        id: "local:library:body",
        mode: "local",
        source: { contentDocumentId: "body" },
        baselineId: "base",
        epoch: 0,
        resourcePaths: { [legacy]: path },
      },
      state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
      updates: [],
    });
    expect((await localizeFragmentResources("local:library:body", content, contracts))[0].url).toBe(
      path
    );
    await expect(
      localizeFragmentResources(
        "local:library:body",
        [{ ...content[0], url: "~/.editor/setting.json" }],
        contracts
      )
    ).rejects.toThrow("不属于复制来源");
    readCache.mockResolvedValue(null);
    await expect(localizeFragmentResources("missing", content, contracts)).rejects.toThrow(
      "来源文档不可用"
    );
  } finally {
    release();
    doc.destroy();
  }
});

it("共享准备只转换契约声明的本地图片，保留公网地址、预览与业务字段", async () => {
  const image = await prepareContentContract("plugin.images", {
    type: "gallery",
    kind: "block",
    dataVersion: 1,
    isVoid: true,
    resources: [{ path: "images[].url", kind: "image", preview: "preview" }],
  });
  const value = {
    title: "正文",
    bannerBg: "linear-gradient(red,blue)",
    bannerPosition: "center",
    content: [
      {
        type: "gallery",
        tauContract: image.id,
        collabId: "gallery",
        cover: "业务字段",
        images: [
          { url: "~/.editor/resources/a.png", preview: "~/.editor/resources/a.png" },
          { url: "https://images.test/public.webp" },
        ],
        children: [{ text: "" }],
      },
    ],
  };
  const context = { serverUrl: "https://collab.test", documentId: "shared" };
  native.mockImplementation(async (_context, action, references: string[]) =>
    Object.fromEntries(
      references.map(reference => [
        reference,
        action === "prepare"
          ? "tau-collab-asset:prepared"
          : reference.startsWith("tau-collab-")
            ? "https://owner.test/saved.webp"
            : reference,
      ])
    )
  );
  const shared = await prepareDocumentResources(context, value, { [image.id]: image.contract });
  expect(native).toHaveBeenCalledWith(context, "prepare", ["~/.editor/resources/a.png"]);
  expect(shared.content[0]).toMatchObject({
    cover: "业务字段",
    collabId: "gallery",
    images: [
      { url: "tau-collab-asset:prepared", preview: "tau-collab-asset:prepared" },
      { url: "https://images.test/public.webp" },
    ],
  });
  const localized = await localizeDocumentResources(context, shared, {
    [image.id]: image.contract,
  });
  expect(localized.content[0]).toMatchObject({
    images: [
      { url: "https://owner.test/saved.webp", preview: "https://owner.test/saved.webp" },
      { url: "https://images.test/public.webp" },
    ],
  });
  expect(shared.content[0]).toMatchObject({
    images: [{ url: "tau-collab-asset:prepared" }, { url: "https://images.test/public.webp" }],
  });
});
