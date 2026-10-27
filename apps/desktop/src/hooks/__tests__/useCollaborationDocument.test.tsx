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
  snapshot: undefined as undefined | Record<string, unknown>,
}));
vi.mock("@/electron", () => ({
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) =>
    host.listeners.set(channel, listener),
  off: (channel: string) => host.listeners.delete(channel),
}));
vi.mock("@/commands", () => ({
  ackCollaborationFreeze: host.ack,
  resolveCollaborationResource: vi.fn(),
  sendCollaborationAwareness: vi.fn(async () => {}),
  preserveCollaborationInputDraft: vi.fn(async () => {}),
  preserveCollaborationDocumentDraft: host.preserveDocument,
  subscribeCollaborationDocument: vi.fn(async () => host.snapshot),
  unsubscribeCollaborationDocument: host.unsubscribe,
  updateCollaborationDocument: host.update,
  uploadCollaborationResource: vi.fn(),
}));
vi.mock("@/commands/contracts/collaboration", () => ({
  collaborationCommands: { prepareFragment: { call: vi.fn() }, updateNodeView: { call: vi.fn() } },
}));

import useCollaborationDocument from "../useCollaborationDocument";

afterEach(() => {
  vi.useRealTimers();
  host.listeners.clear();
  for (const fn of [host.update, host.ack, host.unsubscribe, host.preserveDocument]) fn.mockReset();
});

it("编辑未送达主进程时不回执冻结、不注销视图，送达后才放行", async () => {
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const source = await createNodeDocument(
    { documentId: "doc", baselineId: "base", epoch: 0 },
    {
      title: "",
      content: [
        {
          type: "paragraph",
          collabId: "p",
          tauContract: paragraph.id,
          children: [{ text: "原文" }],
        },
      ],
      bannerBg: "",
      bannerPosition: "center",
    },
    { [paragraph.id]: paragraph.contract }
  );
  host.snapshot = {
    state: Y.encodeStateAsUpdate(source),
    session: { mode: "local", role: "owner", frozen: false },
    user: {},
  };
  source.destroy();
  host.update.mockRejectedValue(new Error("编辑视图已失效"));
  host.preserveDocument.mockResolvedValue(undefined);
  host.ack.mockResolvedValue(undefined);
  host.unsubscribe.mockResolvedValue(undefined);

  let current: ReturnType<typeof useCollaborationDocument>;
  function Harness() {
    current = useCollaborationDocument("doc");
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
  await vi.waitFor(() => expect(current!.binding).toBeDefined());

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
});
