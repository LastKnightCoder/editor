import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import {
  WHITEBOARD_LIMITS,
  type WhiteboardModelCommand,
  type WhiteboardElementSnapshot,
} from "@tau/collaboration";
import { getDefaultHandwriteStyle } from "../../utils/HandwriteUtil";
import { deleteBoardElements } from "../../utils/SelectionActionUtil";
import { createRemovalFixture } from "./removal-fixture";
import type { MindNodeElement } from "../../types";

const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(dispose => dispose())
);
async function setup(state?: Uint8Array) {
  const f = await createRemovalFixture(state);
  cleanup.push(f.dispose);
  return f;
}
const enabled = process.env.WHITEBOARD_REMOVAL_STRESS === "1";
const geometry = { x: 100, y: 100, width: 80, height: 50, rotation: 0 };
const flatten = (nodes: readonly WhiteboardElementSnapshot[]): WhiteboardElementSnapshot[] =>
  nodes.flatMap(node => [node, ...flatten(node.children)]);

it.skipIf(!enabled)(
  "大量导图分支删除包含全部后代，四种布局的历史与远端一致",
  async () => {
    for (const layout of ["mind", "logic", "org", "tree"]) {
      const f = await setup();
      const commands: WhiteboardModelCommand[] = [
        {
          type: "create",
          id: "root",
          contractId: f.schema.types["mind-node"].contractId,
          parent: { kind: "page", id: "page" },
          geometry,
          data: { layout },
          body: [],
        },
      ];
      const removed = new Set<string>();
      for (let branch = 0; branch < 240; branch++) {
        let parent = "root";
        for (let depth = 0; depth < 4; depth++) {
          const id = `branch-${branch}-${depth}`;
          commands.push({
            type: "create",
            id,
            contractId: f.schema.types["mind-node"].contractId,
            parent: { kind: "element", id: parent },
            geometry,
            data: { direction: "right" },
            body: [],
          });
          parent = id;
          if (branch % 2 === 0) removed.add(id);
        }
      }
      f.model.submitChunks(commands, null, f.schema.prepared);
      const before = f.model.read();
      const root = f.board.children[0] as MindNodeElement;
      const peer = await setup(Y.encodeStateAsUpdate(f.doc));
      const start = performance.now();
      deleteBoardElements(
        f.board,
        root.children.filter((_node, index) => index % 2 === 0)
      );
      const deleteMs = performance.now() - start;
      const remaining = flatten(f.model.read().pages[0].children);
      expect(new Set(remaining.map(node => node.id))).toEqual(
        new Set(
          flatten(before.pages[0].children)
            .filter(node => !removed.has(node.id))
            .map(node => node.id)
        )
      );
      expect(f.model.read().pages[0].recovery).toEqual([]);
      for (let round = 0; round < 3; round++) {
        f.binding.undo();
        expect(f.model.read()).toEqual(before);
        f.binding.redo();
        await peer.model.receive(Y.encodeStateAsUpdate(f.doc, Y.encodeStateVector(peer.doc)));
        expect(peer.model.read()).toEqual(f.model.read());
        expect(peer.board.children).toEqual(f.board.children);
      }
      console.info(
        "WHITEBOARD_REMOVAL_MIND",
        JSON.stringify({
          layout,
          modelNodes: 961,
          deletedNodes: removed.size,
          deleteMs,
          historyCycles: 3,
        })
      );
      for (const fixture of [f, peer]) {
        cleanup.splice(cleanup.indexOf(fixture.dispose), 1);
        fixture.dispose();
      }
    }
  },
  120000
);

it.skipIf(!enabled)(
  "接近节点预算的分段手写与导图混合批删、剪切和历史压力",
  async () => {
    for (const strokes of [100, 400, 950]) {
      const f = await setup();
      const commands: WhiteboardModelCommand[] = [];
      const removed = new Set<string>();
      for (let index = 0; index < 20; index++) {
        const id = `frame-${index}`;
        commands.push({
          type: "create",
          id,
          contractId: f.schema.types.frame.contractId,
          parent: { kind: "page", id: "page" },
          geometry,
          data: { title: id },
        });
        if (index % 3 === 0) removed.add(id);
      }
      for (let index = 0; index < strokes; index++) {
        const id = `ink-${index}`,
          parent = `frame-${index % 20}`;
        const deleting = removed.has(parent) || index % 2 === 0;
        commands.push({
          type: "create",
          id,
          contractId: f.schema.types.handwrite.contractId,
          parent: { kind: "element", id: parent },
          geometry,
          data: { segmented: true, points: [], outline: [] },
        });
        commands.push({
          type: "set_node",
          id,
          patch: { style: { ...getDefaultHandwriteStyle() } },
        });
        if (deleting) removed.add(id);
        for (let part = 0; part < 4; part++) {
          const segment = `${id}-part-${part}`;
          commands.push({
            type: "create",
            id: segment,
            contractId: f.schema.types["host.whiteboard.stroke-segment"].contractId,
            parent: { kind: "element", id },
            geometry,
            data: {
              points: [
                { x: index + part, y: 100, pressure: 0.5 },
                { x: index + part + 1, y: 110, pressure: 0.5 },
              ],
            },
          });
          if (deleting) removed.add(segment);
        }
      }
      for (const [index, layout] of ["mind", "logic", "org", "tree"].entries()) {
        const id = `mind-${index}`;
        commands.push({
          type: "create",
          id,
          contractId: f.schema.types["mind-node"].contractId,
          parent: { kind: "page", id: "page" },
          geometry,
          data: { layout },
          body: [],
        });
        for (let child = 0; child < 10; child++) {
          const leaf = `${id}-leaf-${child}`;
          commands.push({
            type: "create",
            id: leaf,
            contractId: f.schema.types["mind-node"].contractId,
            parent: { kind: "element", id },
            geometry,
            data: { direction: "right" },
            body: [],
          });
          if (child % 2 === 0) removed.add(leaf);
        }
      }
      f.model.submitChunks(commands, null, f.schema.prepared);
      const before = f.model.read();
      const all = flatten(before.pages[0].children);
      const expected = new Set(all.filter(node => !removed.has(node.id)).map(node => node.id));
      expect(all.length).toBeLessThanOrEqual(WHITEBOARD_LIMITS.elements);
      const peer = await setup(Y.encodeStateAsUpdate(f.doc));
      const selected = f.board.children.flatMap(node =>
        removed.has(node.id) ? [node] : (node.children ?? []).filter(child => removed.has(child.id))
      );
      const start = performance.now();
      deleteBoardElements(f.board, selected);
      const deleteMs = performance.now() - start;
      expect(new Set(flatten(f.model.read().pages[0].children).map(node => node.id))).toEqual(
        expected
      );
      expect(f.model.read().pages[0].recovery).toEqual([]);
      for (let round = 0; round < 3; round++) {
        f.binding.undo();
        expect(f.model.read()).toEqual(before);
        f.binding.redo();
        await peer.model.receive(Y.encodeStateAsUpdate(f.doc, Y.encodeStateVector(peer.doc)));
        expect(peer.model.read()).toEqual(f.model.read());
        expect(peer.board.children).toEqual(f.board.children);
        expect(f.model.read().pages[0].recovery).toEqual([]);
      }
      const reopened = await setup(Y.encodeStateAsUpdate(f.doc));
      expect(reopened.board.children).toEqual(f.board.children);
      f.binding.undo();
      f.board.apply(
        {
          type: "set_selection",
          properties: f.board.selection,
          newProperties: { selectedElements: f.board.children, selectArea: null },
        },
        false
      );
      const event = new Event("cut", { cancelable: true });
      const clipboard = new Map<string, string>();
      Object.defineProperty(event, "clipboardData", {
        value: { setData: (type: string, value: string) => clipboard.set(type, value) },
      });
      f.board.onCut(event as ClipboardEvent);
      expect(f.board.children).toEqual([]);
      expect(f.model.read().pages[0].recovery).toEqual([]);
      const payload = clipboard.get("application/json");
      if (!payload) throw new Error("剪切没有提供完整白板包");
      const bundle = JSON.parse(payload);
      const pasted = await setup();
      await pasted.binding.importTransfer(bundle);
      expect(flatten(pasted.model.read().pages[0].children)).toHaveLength(all.length);
      expect(pasted.model.read().pages[0].recovery).toEqual([]);
      const pastedStrokes = pasted.board.children
        .flatMap(node => node.children ?? [])
        .filter(node => node.type === "handwrite");
      expect(pastedStrokes).toHaveLength(strokes);
      for (const node of pastedStrokes) {
        expect(node.points).toHaveLength(8);
        expect(node.outline.length).toBeGreaterThan(0);
      }
      console.info(
        "WHITEBOARD_REMOVAL_CAPACITY",
        JSON.stringify({
          strokes,
          modelNodes: all.length,
          deletedNodes: removed.size,
          deleteMs,
          historyCycles: 3,
          cutPaste: true,
        })
      );
      for (const fixture of [f, peer, reopened, pasted]) {
        cleanup.splice(cleanup.indexOf(fixture.dispose), 1);
        fixture.dispose();
      }
    }
  },
  240000
);

it.skipIf(!enabled)(
  "离线追加与删除乱序、重复交付后收敛，撤销保留并发笔迹",
  async () => {
    const local = await setup();
    const peer = await setup(Y.encodeStateAsUpdate(local.doc));
    const observer = await setup(Y.encodeStateAsUpdate(local.doc));
    const recovered = new Set<string>();
    const rounds = 40;
    const start = performance.now();
    for (let round = 0; round < rounds; round++) {
      const id = `concurrent-${round}`;
      local.stroke(id);
      await peer.model.receive(Y.encodeStateAsUpdate(local.doc));
      await observer.model.receive(Y.encodeStateAsUpdate(local.doc));
      const baseline = Y.encodeStateVector(local.doc);
      peer.binding.appendStroke(
        id,
        [
          { x: round, y: 100, pressure: 0.5 },
          { x: round + 10, y: 150, pressure: 0.5 },
        ],
        getDefaultHandwriteStyle()
      );
      const appended = peer.model
        .read()
        .pages[0].children.find(node => node.id === id)
        ?.children.at(-1);
      if (!appended) throw new Error("未生成并发追加分段");
      recovered.add(appended.id);
      const ink = local.board.children.find(node => node.id === id);
      if (!ink) throw new Error("待删除笔迹不可见");
      deleteBoardElements(local.board, [ink]);
      const deletion = Y.encodeStateAsUpdate(local.doc, baseline);
      const addition = Y.encodeStateAsUpdate(peer.doc, baseline);
      await observer.model.receive(addition);
      await observer.model.receive(deletion);
      await observer.model.receive(addition);
      await local.model.receive(addition);
      await peer.model.receive(deletion);
      expect(local.model.read()).toEqual(peer.model.read());
      expect(local.model.read()).toEqual(observer.model.read());
      expect(new Set(local.model.read().pages[0].recovery.map(node => node.id))).toEqual(recovered);
      expect(local.board.children).toEqual([]);
      expect(peer.board.children).toEqual([]);
      expect(observer.board.children).toEqual([]);
      local.binding.undo();
      expect(local.board.children.find(node => node.id === id)?.points).toHaveLength(6);
      local.binding.redo();
      expect(local.board.children).toEqual([]);
      await peer.model.receive(Y.encodeStateAsUpdate(local.doc));
      await observer.model.receive(Y.encodeStateAsUpdate(local.doc));
    }
    console.info(
      "WHITEBOARD_REMOVAL_CONCURRENCY",
      JSON.stringify({
        rounds,
        clients: 3,
        elapsedMs: performance.now() - start,
        retainedConcurrentSegments: recovered.size,
      })
    );
  },
  120000
);
