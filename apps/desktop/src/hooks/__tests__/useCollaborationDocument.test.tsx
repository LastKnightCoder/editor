import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createNodeDocument } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";

const host = vi.hoisted(() => ({
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
  update: vi.fn(),
  ack: vi.fn(),
  unsubscribe: vi.fn(),
  preserveDocument: vi.fn(),
  upload: vi.fn(),
  prepareResource: vi.fn(),
  memberUpload: vi.fn(),
  snapshot: undefined as undefined | Record<string, unknown>,
}));
vi.mock("@/electron", () => ({
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) =>
    host.listeners.set(channel, listener),
  off: (channel: string) => host.listeners.delete(channel),
}));
vi.mock("@/hooks/useUploadResource", () => ({ uploadResource: host.upload }));
vi.mock("@/commands/contracts/collaboration", () => {
  const commands = {
    freezeAck: { call: host.ack },
    resolveResource: { call: vi.fn() },
    awareness: { call: vi.fn(async () => {}) },
    inputDraft: { call: vi.fn(async () => {}) },
    documentDraft: { call: host.preserveDocument },
    subscribe: { call: vi.fn(async () => host.snapshot) },
    unsubscribe: { call: host.unsubscribe },
    update: { call: host.update },
    prepareFragment: { call: vi.fn() },
    prepareResource: { call: host.prepareResource },
    uploadSharedResource: { call: host.memberUpload },
    updateNodeView: { call: vi.fn() },
  };
  return { collaborationCommands: commands, localContentCommands: commands };
});

import useCollaborationDocument from "../useCollaborationDocument";

afterEach(() => {
  vi.useRealTimers();
  host.listeners.clear();
  for (const fn of [
    host.update,
    host.ack,
    host.unsubscribe,
    host.preserveDocument,
    host.upload,
    host.prepareResource,
    host.memberUpload,
  ])
    fn.mockReset();
});

it.each(["local", "shared"] as const)(
  "编辑未送达主进程时不回执冻结、不注销视图，送达后才放行（%s）",
  async mode => {
    const documentIdentity = {
      documentId: mode === "local" ? "stable-document" : "doc",
      baselineId: "base",
      epoch: mode === "local" ? 3 : 0,
    };
    const paragraph = await prepareContentContract("tau.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    const image = await prepareContentContract("tau.image", {
      type: "image",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: [{ path: "url", kind: "image" }],
    });
    const source = await createNodeDocument(
      documentIdentity,
      {
        title: "",
        content: [
          {
            type: "paragraph",
            collabId: "p",
            tauContract: paragraph.id,
            children: [{ text: "原文" }],
          },
          {
            type: "image",
            collabId: "image",
            tauContract: image.id,
            url:
              mode === "local"
                ? "~/.editor/resources/image.webp"
                : "https://images.test/image.webp",
            children: [{ text: "" }],
          },
        ],
        bannerBg: "",
        bannerPosition: "center",
      },
      { [paragraph.id]: paragraph.contract, [image.id]: image.contract },
      { allowLocalResources: true }
    );
    host.snapshot = {
      documentIdentity,
      state: Y.encodeStateAsUpdate(source),
      session: { mode, role: mode === "local" ? "owner" : "editor", frozen: false },
      user: {},
    };
    source.destroy();
    host.update.mockRejectedValue(new Error("编辑视图已失效"));
    host.preserveDocument.mockResolvedValue(undefined);
    host.ack.mockResolvedValue(undefined);
    host.unsubscribe.mockResolvedValue(undefined);

    let current: ReturnType<typeof useCollaborationDocument>;
    function Harness() {
      current = useCollaborationDocument("doc", mode);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await vi.waitFor(() => expect(current!.binding).toBeDefined());
    expect(current!.error).toBeUndefined();
    expect(current!.article!.content[0].children).toMatchObject([{ text: "原文" }]);
    expect(current!.binding!.doc.getMap("meta").get("documentId")).toBe(
      documentIdentity.documentId
    );
    const uploaded = "https://images.test/compressed.webp";
    host.upload.mockResolvedValue(uploaded);
    host.prepareResource.mockResolvedValue(uploaded);
    host.memberUpload.mockResolvedValue("tau-collab-asset:member");
    const bytes = new Uint8Array([1, 2, 3]);
    const file = Object.assign(new File([bytes], "image.png", { type: "image/png" }), {
      arrayBuffer: async () => bytes.buffer,
    });
    if (mode === "local") {
      await expect(current!.binding!.uploadResource(file)).resolves.toBe(uploaded);
      expect(host.upload).toHaveBeenCalledWith(file);
      expect(host.prepareResource).toHaveBeenCalledWith(current!.binding!.viewId, uploaded);
    } else {
      await expect(current!.binding!.uploadResource(file)).resolves.toBe("tau-collab-asset:member");
      expect(host.memberUpload).toHaveBeenCalledWith(current!.binding!.viewId, {
        name: file.name,
        mime: file.type,
        bytes,
      });
      expect(host.upload).not.toHaveBeenCalled();
      expect(host.prepareResource).not.toHaveBeenCalled();
    }

    await act(async () => current!.binding!.doc.getText("title").insert(0, "未送达"));
    await vi.waitFor(() => expect(host.preserveDocument).toHaveBeenCalled());
    expect(current!.error).toBe("编辑视图已失效");

    await act(async () =>
      host.listeners.get("collaboration:freeze")!(undefined, {
        documentId: "doc",
        frozen: true,
        requestId: "freeze-1",
      })
    );
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
    expect(host.ack).not.toHaveBeenCalled();

    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearInterval"] });
    await act(async () => root.unmount());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(host.unsubscribe).not.toHaveBeenCalled();

    host.update.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(host.update).toHaveBeenLastCalledWith("doc", expect.any(Uint8Array), expect.any(String));
    expect(host.unsubscribe).toHaveBeenCalledTimes(1);
  }
);
