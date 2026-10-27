import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import { createNodeDocument, type ContentNode } from "@tau/collaboration";
import { createEditorKit } from "@tau/editor";
import type { ContentCollaborationBinding } from "@tau/editor-collab";
import { desktopContentPlugins } from "../../../shared/content-plugins";
import { useBoundContentDocument } from "../useContentDocument";
import { IResourceService } from "@tau/shared/host-services";

it("换源等待期间不复用已销毁文档，新绑定就绪后恢复", async () => {
  const kit = createEditorKit({
    services: [register => register(IResourceService, { upload: async () => "" })],
  });
  const catalog = await desktopContentPlugins.prepareEditorContracts(kit.extensions);
  const value = await catalog.createDocument([
    { type: "paragraph", children: [{ type: "formatted", text: "保留正文" }] },
  ]);
  const bindings: ContentCollaborationBinding[] = [];
  const makeBinding = async () => {
    const doc = await createNodeDocument(
      { documentId: crypto.randomUUID(), baselineId: crypto.randomUUID(), epoch: 0 },
      {
        title: "",
        content: value.content as ContentNode[],
        bannerBg: "",
        bannerPosition: "center",
      },
      value.contracts
    );
    const binding = {
      doc,
      awareness: new Awareness(doc),
      origin: {},
      mode: "local",
    } as ContentCollaborationBinding;
    bindings.push(binding);
    return binding;
  };
  let current: ReturnType<typeof useBoundContentDocument>;
  function Harness({ binding }: { binding?: ContentCollaborationBinding }) {
    current = useBoundContentDocument(binding, { kit });
    return null;
  }
  const container = document.createElement("div"),
    root = createRoot(container);
  const ready = () =>
    vi.waitFor(async () => {
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(current!.error).toBeUndefined();
      expect(current!.document).toBeDefined();
    });
  try {
    const first = await makeBinding();
    await act(async () => root.render(<Harness binding={first} />));
    await ready();
    expect(current!.document).toBeDefined();
    await act(async () => root.render(<Harness />));
    expect(current!.swapping).toBe(true);
    await act(async () => first.doc.destroy());
    expect(current!.document).toBeUndefined();
    expect(current!.binding).toBeUndefined();
    const next = await makeBinding();
    await act(async () => root.render(<Harness binding={next} />));
    await ready();
    expect(current!.document).toBeDefined();
    expect(current!.binding).toBe(next);
    expect(current!.error).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    for (const binding of bindings) {
      binding.awareness.destroy();
      if (!binding.doc.isDestroyed) binding.doc.destroy();
    }
  }
});
