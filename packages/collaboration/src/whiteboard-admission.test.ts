import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  fixture,
  model,
  documents,
  create,
  pageParent,
  flat,
  changes,
} from "./whiteboard-test-utils";

afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));

describe("白板候选接纳与稳定结构", () => {
  it("重复位置引用整批拒绝，不把重复网络重放当重复位置", async () => {
    const { board, page, shape } = await fixture();
    create(board, shape, pageParent(page));
    const peer = model(Y.encodeStateAsUpdate(board.doc)),
      order = peer.orders.get(`page:${page}`)!;
    order.push([order.get(0)]);
    const before = Y.encodeStateAsUpdate(board.doc);
    await expect(board.receive(Y.encodeStateAsUpdate(peer.doc))).rejects.toThrow("引用重复");
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
  });
  it("缺失或旧格式 profile 不隐式修复，未知原始字段不能成为旁路", async () => {
    const { board, page, shape } = await fixture();
    const target = create(board, shape, pageParent(page));
    const before = Y.encodeStateAsUpdate(board.doc);
    for (const mutation of [
      (peer: ReturnType<typeof model>) => peer.doc.getMap("whiteboard:meta").delete("profile"),
      (peer: ReturnType<typeof model>) =>
        peer.doc.getMap("whiteboard:meta").set("profile", "legacy"),
      (peer: ReturnType<typeof model>) => peer.elements.get(target)!.set("children", []),
    ]) {
      const peer = model(before);
      mutation(peer);
      await expect(board.receive(Y.encodeStateAsUpdate(peer.doc))).rejects.toThrow();
      expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
    }
  });
  it("普通 JSON 业务字段不能偷偷变成可深合并 Y.Map", async () => {
    const { board, page, shape } = await fixture();
    const target = create(board, shape, pageParent(page));
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    const nested = new Y.Map();
    nested.set("min", 1);
    (peer.elements.get(target)!.get("data") as Y.Map<unknown>).set("range", nested);
    const before = Y.encodeStateAsUpdate(board.doc);
    await expect(board.receive(Y.encodeStateAsUpdate(peer.doc))).rejects.toThrow("有限 JSON");
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
  });
  it("富文本初始节点的原共享正文不能被同 JSON 新对象替换", async () => {
    const { board, page, rich } = await fixture();
    const target = create(board, rich, pageParent(page), "seed", [
      { type: "paragraph", children: [{ text: "正文" }] },
    ]);
    const peer = model(Y.encodeStateAsUpdate(board.doc)),
      tree = peer.richText(target),
      node = tree.read()[0].collabId as string;
    const text = new Y.XmlText();
    text.insert(0, "正文");
    tree.record(node).set("content", text);
    const before = Y.encodeStateAsUpdate(board.doc);
    await expect(board.receive(Y.encodeStateAsUpdate(peer.doc))).rejects.toThrow("重建富文本");
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
  });
  it("补依赖后才暴露的非法字段仍整批拒绝，不将暂存当作确认", async () => {
    const { board, page, shape } = await fixture(),
      peer = model(Y.encodeStateAsUpdate(board.doc));
    const first: Uint8Array[] = [],
      capture = (update: Uint8Array) => first.push(update);
    board.doc.on("update", capture);
    const target = create(board, shape, pageParent(page));
    board.doc.off("update", capture);
    const second: Uint8Array[] = [],
      captureSecond = (update: Uint8Array) => second.push(update);
    board.doc.on("update", captureSecond);
    board.elements.get(target)!.set("children", []);
    board.doc.off("update", captureSecond);
    const before = Y.encodeStateAsUpdate(peer.doc);
    expect(await peer.receive(Y.mergeUpdates(second))).toEqual({ status: "pending" });
    await expect(peer.receive(Y.mergeUpdates(first))).rejects.toThrow();
    expect(Y.encodeStateAsUpdate(peer.doc)).toEqual(before);
    const preserved = peer.takePendingUpdate();
    expect(preserved).toEqual(Y.mergeUpdates(second));
    expect(peer.takePendingUpdate()).toBeUndefined();
    await peer.receive(Y.mergeUpdates(first));
    expect(flat(peer.read())[0].id).toBe(target);
  });
  it("异步契约验证期间的本机修改不被旧候选覆盖", async () => {
    const { board, page, shape } = await fixture();
    const target = create(board, shape, pageParent(page));
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    const update = changes(
      board,
      [{ type: "set_data", id: target, patch: { remote: "远端" } }],
      {}
    );
    const receiving = peer.receive(update);
    await Promise.resolve();
    peer.submit([{ type: "set_data", id: target, patch: { local: "本机" } }], {});
    await receiving;
    expect(flat(peer.read())[0].data).toMatchObject({ remote: "远端", local: "本机" });
  });
  it("接收时复制 Buffer 的字节，调用方改写输入不影响已排队候选", async () => {
    const { board } = await fixture();
    const peer = model(),
      input = Buffer.from(Y.encodeStateAsUpdate(board.doc));
    const receiving = peer.receive(input);
    input.fill(0);
    await receiving;
    expect(peer.read()).toEqual(board.read());
  });
  it("并发排队的接收字节也有界，拒绝多余请求且保留已接纳内容", async () => {
    const { board } = await fixture();
    board.title.insert(0, "x".repeat(5 * 1024 * 1024));
    const peer = model(),
      update = Y.encodeStateAsUpdate(board.doc);
    const results = await Promise.allSettled([peer.receive(update), peer.receive(update)]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(peer.title.toString()).toBe(board.title.toString());
    await peer.receive(update);
    expect(peer.read()).toEqual(board.read());
  });
  it("缺插件仍按存储契约保留载荷、整体移动删除，数据投影不需要渲染器", async () => {
    const { board, page, secondPage, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    board.submit([{ type: "set_data", id: target, patch: { opaque: { untouched: [1, 2] } } }], {});
    const peer = model();
    await peer.receive(Y.encodeStateAsUpdate(board.doc));
    peer.submit([{ type: "move_node", id: target, parent: pageParent(secondPage) }], {});
    expect(peer.read().pages[1].children[0].data.opaque).toEqual({ untouched: [1, 2] });
    peer.submit([{ type: "remove_nodes", ids: [target] }], {});
    expect(flat(peer.read())).toEqual([]);
    expect(peer.elements.has(target)).toBe(true);
  });
});
