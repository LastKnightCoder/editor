import * as Y from "yjs";
import { WhiteboardModel, type WhiteboardModelCommand } from "@tau/collaboration";
import type { createWhiteboardBinding } from "@tau/whiteboard/collaboration";
import { FrameWorkerPrototype } from "./client";

export async function stressProofChain(
  model: WhiteboardModel,
  binding: ReturnType<typeof createWhiteboardBinding>,
  worker: FrameWorkerPrototype,
  verify: () => Promise<void>,
  rounds: number
) {
  const flat = (nodes: ReturnType<WhiteboardModel["read"]>["recovery"]): typeof nodes =>
    nodes.flatMap(node => [node, ...flat(node.children)]);
  const before = model.read(),
    states = [before];
  const originals = flat(before.pages[0].children),
    bodies = new Map(
      originals
        .filter(node => Array.isArray(node.body) && node.body.length)
        .map(node => [node.id, node.body])
    );
  if (!bodies.size) throw new Error("连续交接压力缺少非空富文本");
  const peer = new WhiteboardModel(new Y.Doc({ gc: false }));
  const check = async () => {
    await verify();
    await peer.receive(Y.encodeStateAsUpdate(model.doc));
    if (JSON.stringify(peer.read()) !== JSON.stringify(model.read()))
      throw new Error("连续交接协作副本不一致");
  };
  const progress = (phase: string, round: number) => {
    void fetch(`/__frame-worker-progress?phase=${phase}&round=${round}`).catch(() => {});
  };
  try {
    model.prepareLocalTranslations();
    for (let round = 0; round < rounds; round++) {
      progress("chain-prepare", round);
      const nodes = flat(model.read().pages[0].children);
      const commands: WhiteboardModelCommand[] = nodes.map(node => ({
        type: "set_node",
        id: node.id,
        patch: { geometry: { ...node.geometry, x: node.geometry.x + 3, y: node.geometry.y + 2 } },
      }));
      const receipt = await worker.prepare(commands, binding.board?.captureSubmission());
      if (!receipt.candidate.proofReused || !receipt.candidate.baselineReused)
        throw new Error("连续提交没有复用镜像基线");
      const origin = {},
        release = binding.history.retainOrigin(origin);
      binding.history.stopCapturing();
      binding.writing = true;
      try {
        const result = worker.commit(receipt, origin);
        if (!result.snapshot || !result.capacity) throw new Error("连续提交丢失主线程证明");
      } finally {
        binding.writing = false;
        binding.history.stopCapturing();
        release();
      }
      binding.refreshLayout();
      const after = model.read(),
        actual = flat(after.pages[0].children);
      if (actual.length !== originals.length) throw new Error("连续提交丢失节点");
      for (const node of actual) {
        const body = bodies.get(node.id);
        if (body && body !== node.body) throw new Error("连续提交重新读取了未变化正文");
        const original = originals.find(value => value.id === node.id);
        if (
          !original ||
          node.geometry.x !== original.geometry.x + 3 * (round + 1) ||
          node.geometry.y !== original.geometry.y + 2 * (round + 1)
        )
          throw new Error("连续提交几何累积错误");
      }
      states.push(after);
      await check();
    }
    for (let round = rounds - 1; round >= 0; round--) {
      progress("chain-undo", round);
      binding.undo();
      if (JSON.stringify(model.read()) !== JSON.stringify(states[round]))
        throw new Error("连续提交撤销顺序错误");
      await check();
    }
    for (let round = 1; round <= rounds; round++) {
      progress("chain-redo", round);
      binding.redo();
      if (JSON.stringify(model.read()) !== JSON.stringify(states[round]))
        throw new Error("连续提交重做顺序错误");
      await check();
    }
    return {
      rounds,
      elements: originals.length,
      geometryWrites: rounds * originals.length,
      bodyReferencesRetained: bodies.size,
      mirrorProofsReused: rounds,
      snapshots: rounds,
      capacities: rounds,
      binaryReopen: true,
      independentReplica: true,
    };
  } finally {
    peer.doc.destroy();
    worker.dispose();
  }
}

export async function stressPrototype(
  model: WhiteboardModel,
  binding: ReturnType<typeof createWhiteboardBinding>,
  worker: FrameWorkerPrototype,
  frameCommand: (id: string) => WhiteboardModelCommand,
  verify: () => Promise<void>,
  cycles: number
) {
  const peer = new WhiteboardModel(new Y.Doc({ gc: false }));
  await peer.receive(Y.encodeStateAsUpdate(model.doc));
  const records = new Map(model.elements),
    bodies = new Map([...model.elements].map(([id, record]) => [id, record.get("fieldBindings")]));
  let edits = 0,
    rejected = 0,
    moves = 0;
  let snapshots = 0,
    capacities = 0;
  let candidatesReused = 0;
  const progress = (phase: string) => {
    void fetch(
      `/__frame-worker-progress?phase=${encodeURIComponent(phase)}&edits=${edits}&moves=${moves}`
    ).catch(() => {});
  };
  const check = async () => {
    progress("verify-local");
    await verify();
    progress("verify-peer");
    await peer.receive(Y.encodeStateAsUpdate(model.doc));
    if (JSON.stringify(peer.read()) !== JSON.stringify(model.read()))
      throw new Error("后台事务协作副本不一致");
    for (const [id, record] of records) {
      if (
        model.elements.get(id) !== record ||
        JSON.stringify(record.get("fieldBindings")) !== JSON.stringify(bodies.get(id))
      )
        throw new Error("后台事务重建了既有元素或正文身份");
    }
  };
  const commit = async (commands: WhiteboardModelCommand[]) => {
    progress("prepare");
    const before = JSON.stringify(model.read()),
      origin = {},
      receipt = await worker.prepare(commands, binding.board?.captureSubmission());
    candidatesReused += Number(receipt.candidate.proofReused);
    if (worker.incremental && !receipt.candidate.proofReused)
      throw new Error("正常结构候选没有复用已验证基线");
    const count = binding.history.undoStack.length;
    binding.history.stopCapturing();
    const release = binding.history.retainOrigin(origin);
    progress("merge");
    binding.writing = true;
    try {
      const result = worker.commit(receipt, origin);
      snapshots += Number(result.snapshot);
      capacities += Number(result.capacity);
      if (worker.proofHandoff && (!result.snapshot || !result.capacity))
        throw new Error("正常结构操作没有交接完整证明");
    } finally {
      binding.writing = false;
      binding.history.stopCapturing();
      release();
    }
    binding.refreshLayout();
    if (binding.history.undoStack.length !== count + 1)
      throw new Error("后台事务没有形成一个撤销项");
    moves += commands.filter(command => command.type === "move_node").length;
    const after = JSON.stringify(model.read());
    await check();
    progress("undo");
    binding.undo();
    if (JSON.stringify(model.read()) !== before) throw new Error("后台事务撤销丢数据");
    await check();
    progress("redo");
    binding.redo();
    if (JSON.stringify(model.read()) !== after) throw new Error("后台事务重做丢数据");
    await check();
    edits++;
  };
  const reject = async (action: () => Promise<unknown> | unknown) => {
    const before = JSON.stringify(model.read()),
      count = binding.history.undoStack.length;
    let updates = 0;
    const observed = () => updates++;
    model.doc.on("update", observed);
    let failed = false;
    try {
      await action();
    } catch {
      failed = true;
    } finally {
      model.doc.off("update", observed);
    }
    if (
      !failed ||
      updates ||
      count !== binding.history.undoStack.length ||
      before !== JSON.stringify(model.read())
    )
      throw new Error("失效或取消候选仍写入了文档或历史");
    rejected++;
  };
  try {
    // 旧分栏契约须先升级，不能通过后台写入绕过收纳约束。
    const column = [...model.contracts].find(
      ([, value]) =>
        value.domain === "whiteboard-element" && value.type === "column" && value.dataVersion === 2
    );
    const legacy = model
      .read()
      .pages[0].children.find(node => node.type === "column" && node.contractId !== column?.[0]);
    if (legacy && column)
      await commit([{ type: "upgrade_column", id: legacy.id, contractId: column[0] }]);
    for (let cycle = 0; cycle < cycles; cycle++) {
      const page = model.read().pages[0];
      for (const frame of page.children.filter(node => node.type === "frame"))
        await commit([
          ...frame.children.map(node => ({
            type: "move_node" as const,
            id: node.id,
            parent: { kind: "page" as const, id: page.id },
          })),
          { type: "remove_nodes", ids: [frame.id] },
        ]);
      const roots = model.read().pages[0].children.filter(node => node.type !== "arrow"),
        id = `async-cycle-${cycle}`;
      await commit([
        frameCommand(id),
        ...roots.map(node => ({
          type: "move_node" as const,
          id: node.id,
          parent: { kind: "element" as const, id },
        })),
      ]);
      const frame = model.read().pages[0].children.find(node => node.id === id);
      if (!frame || frame.children.length !== roots.length)
        throw new Error("后台收纳没有包含全部预期元素");
      const geometries: WhiteboardModelCommand[] = [];
      const visit = (node: typeof frame) => {
        geometries.push({
          type: "set_node",
          id: node.id,
          patch: {
            geometry: { ...node.geometry, x: node.geometry.x + 11, y: node.geometry.y - 7 },
          },
        });
        node.children.forEach(visit);
      };
      visit(frame);
      await commit(geometries);
      if (frame.children.length) {
        const first = frame.children[0];
        await commit([{ type: "move_node", id: first.id, parent: { kind: "page", id: page.id } }]);
        const beforeId = model.read().pages[0].children.find(node => node.id === id)
          ?.children[0]?.id;
        const returning = {
          type: "move_node" as const,
          id: first.id,
          parent: { kind: "element" as const, id },
        };
        await commit([beforeId ? { ...returning, beforeId } : returning]);
      }
    }
    const target = model.read().pages[0].children.find(node => node.type === "frame");
    if (!target) throw new Error("压力结束缺少画框");
    const command: WhiteboardModelCommand[] = [
      {
        type: "set_node",
        id: target.id,
        patch: { geometry: { ...target.geometry, x: target.geometry.x + 1 } },
      },
    ];
    const cancelled = await worker.prepare(command);
    worker.cancel(cancelled);
    await reject(() => worker.commit(cancelled, {}));
    let writable = true;
    const denied = await worker.prepare(command, () => writable);
    writable = false;
    await reject(() => worker.commit(denied, {}));
    await reject(async () => {
      const controller = new AbortController(),
        pending = worker.prepare(command, () => true, controller.signal);
      await Promise.resolve();
      controller.abort();
      await pending;
    });
    await reject(() =>
      worker.prepare([
        { type: "move_node", id: target.id, parent: { kind: "element", id: target.id } },
      ])
    );
    const stale = await worker.prepare(command);
    peer.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "远端变更" } }], {});
    await model.receive(Y.encodeStateAsUpdate(peer.doc));
    await reject(() => worker.commit(stale, {}));
    await check();
    const oldRoots = await worker.prepare(command);
    model.doc.getMap("node-tree:roots:reserved-empty:nodes");
    await reject(() => worker.commit(oldRoots, {}));
    await check();
    await commit(command);
    const repeated = await worker.prepare(command);
    worker.commit(repeated, {});
    await reject(() => worker.commit(repeated, {}));
    await check();
    // 完整 V1 保存并重新接纳，覆盖初始化保护和撤销重做之后的全部正文。
    const saved = new WhiteboardModel(new Y.Doc({ gc: false }));
    try {
      await saved.receive(Y.encodeStateAsUpdate(model.doc));
      if (JSON.stringify(saved.read()) !== JSON.stringify(model.read()))
        throw new Error("后台事务保存重开不一致");
    } finally {
      saved.doc.destroy();
    }
    const pending = worker.prepare(command);
    await Promise.resolve();
    worker.dispose();
    await reject(() => pending);
    return {
      cycles,
      edits,
      moves,
      rejected,
      snapshots,
      capacities,
      candidatesReused,
      elements: records.size,
      independentReplica: true,
      binaryReopen: true,
    };
  } finally {
    worker.dispose();
    peer.doc.destroy();
  }
}
