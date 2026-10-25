import { describe, expect, it, vi } from "vitest";
import type { WebAnnotation } from "@tau/shared/browser-companion";
import { AnnotationStore } from "../background/annotation-store";
import type { KeyValueStore } from "../background/connection";

const memory = (): KeyValueStore & { data: Record<string, unknown> } => {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async <T>(key: string) => data[key] as T | undefined,
    set: async (key, value) => void (data[key] = value),
    remove: async key => void delete data[key],
  };
};

const item = (id: string): WebAnnotation => ({
  id,
  color: "yellow",
  text: id,
  note: "",
  anchor: null,
  createdAt: 1,
});

describe("AnnotationStore", () => {
  it("离线时存本机并记待同步，就绪后按页补发整页快照", async () => {
    let ready = false;
    const request = vi.fn(async () => []);
    const store = new AnnotationStore(memory(), {
      isReady: () => ready,
      request: request as never,
    });
    await store.save("https://a.com/x#top", "A", [item("h1")]);
    expect(request).not.toHaveBeenCalled();
    expect(await store.load("https://a.com/x")).toEqual([item("h1")]);

    ready = true;
    await store.flush();
    expect(request).toHaveBeenCalledWith("annotations.sync", {
      url: "https://a.com/x",
      title: "A",
      items: [item("h1")],
    });
    request.mockClear();
    await store.flush();
    expect(request).not.toHaveBeenCalled();
  });

  it("连上时以 Tau 为准；未同步的本机改动先推上去", async () => {
    const remote = [item("from-tau")];
    const request = vi.fn(async (method: string) =>
      method === "annotations.list" ? remote : { ok: true }
    );
    const storage = memory();
    const store = new AnnotationStore(storage, { isReady: () => true, request: request as never });
    expect(await store.load("https://a.com/x")).toEqual(remote);

    request.mockImplementationOnce(async () => {
      throw new Error("网络断了");
    });
    await store.save("https://a.com/x", "A", [item("local")]);
    expect(await store.load("https://a.com/x")).toEqual([item("local")]);
    expect(request).toHaveBeenLastCalledWith(
      "annotations.sync",
      expect.objectContaining({ items: [item("local")] })
    );
  });
});
