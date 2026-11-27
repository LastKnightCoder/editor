import type { WhiteboardModel, WhiteboardModelCommand } from "@tau/collaboration";
import type { createWhiteboardBinding } from "@tau/whiteboard/collaboration";
import { FrameWorkerPrototype } from "./client";
import { stressPrototype, stressProofChain } from "./stress";

interface Fixture {
  model: WhiteboardModel;
  binding: ReturnType<typeof createWhiteboardBinding>;
  frameCommand(id: string): WhiteboardModelCommand;
  verify(): Promise<void>;
}

export async function createPrototypeScenario(
  fixture: Fixture,
  startWorker = true,
  handoff = false,
  incremental = false
) {
  const { model, binding } = fixture;
  const initStart = performance.now();
  const worker = startWorker ? new FrameWorkerPrototype(model, handoff, incremental) : undefined;
  await worker?.ready;
  const initMs = worker ? performance.now() - initStart : 0;
  return {
    worker,
    stress: (cycles: number) => {
      if (!worker) throw new Error("压力场景没有启动后台准备器");
      return stressPrototype(model, binding, worker, fixture.frameCommand, fixture.verify, cycles);
    },
    chain: (rounds: number) => {
      if (!worker) throw new Error("连续压力没有启动后台准备器");
      return stressProofChain(model, binding, worker, fixture.verify, rounds);
    },
    async run(
      action: "create" | "dissolve" | "geometry",
      mode: "sync" | "worker" | "handoff" | "incremental"
    ) {
      const before = model.read(),
        page = before.pages[0],
        frame = page.children.find(node => node.type === "frame");
      const commands: WhiteboardModelCommand[] = [];
      if (action === "create") {
        commands.push(fixture.frameCommand("candidate-frame"));
        commands.push(
          ...page.children.map(node => ({
            type: "move_node" as const,
            id: node.id,
            parent: { kind: "element" as const, id: "candidate-frame" },
          }))
        );
      } else {
        if (!frame) throw new Error("原型缺少画框");
        if (action === "dissolve") {
          commands.push(
            ...frame.children.map(node => ({
              type: "move_node" as const,
              id: node.id,
              parent: { kind: "page" as const, id: page.id },
            }))
          );
          commands.push({ type: "remove_nodes", ids: [frame.id] });
        } else {
          const visit = (node: typeof frame) => {
            commands.push({
              type: "set_node",
              id: node.id,
              patch: {
                geometry: { ...node.geometry, x: node.geometry.x + 220, y: node.geometry.y + 40 },
              },
            });
            node.children.forEach(visit);
          };
          visit(frame);
        }
      }
      if (mode === "sync") worker?.dispose();
      if (mode !== "sync" && !worker) throw new Error("原型没有启动后台准备器");
      model.prepareLocalTranslations();
      const origin = {},
        release = binding.history.retainOrigin(origin);
      binding.history.stopCapturing();
      const historyBefore = binding.history.undoStack.length;
      const originals = [...document.querySelectorAll("svg[data-whiteboard-canvas] svg")];
      const editors = [...document.querySelectorAll("[data-slate-editor]")];
      let renderedElements = 0,
        movedHosts = 0,
        movedBatches = 0;
      const board = binding.board;
      if (!board) throw new Error("没有挂载画布");
      const renderPlugin = board.renderPluginElement.bind(board);
      board.renderPluginElement = (...args) => {
        renderedElements++;
        return renderPlugin(...args);
      };
      const mutations = new MutationObserver(records => {
        for (const record of records)
          for (const node of record.removedNodes) {
            if (node instanceof Element && node.hasAttribute("data-element-host")) movedHosts++;
            if (node instanceof Element && node.hasAttribute("data-element-batch")) movedBatches++;
          }
      });
      mutations.observe(document.querySelector("svg[data-whiteboard-canvas]") ?? document.body, {
        subtree: true,
        childList: true,
      });
      const sample = originals.find(
        node => node.closest("[data-element-host]")?.getAttribute("data-element-host") === "node-0"
      );
      const screen = () => {
        const matrix =
          sample instanceof SVGSVGElement && sample.isConnected ? sample.getScreenCTM() : null;
        return matrix ? new DOMPoint(0, 0).matrixTransform(matrix) : undefined;
      };
      const initialScreen = screen();
      const frames: number[] = [],
        longFrames: { delta: number; at: number; phase: string }[] = [];
      const frameStart = await new Promise<number>(resolve => requestAnimationFrame(resolve));
      let phase = "prepare",
        previous = frameStart,
        active = true,
        handle = 0;
      const start = performance.now();
      performance.mark("frame-sample-start");
      const tick = (now: number) => {
        if (!active) return;
        const delta = now - previous;
        frames.push(delta);
        if (delta > 20) longFrames.push({ delta, at: now - start, phase });
        previous = now;
        handle = requestAnimationFrame(tick);
      };
      handle = requestAnimationFrame(tick);
      const read = model.read.bind(model);
      let readMs = 0,
        reads = 0;
      let fullReads = 0,
        fullValidations = 0;
      const validateState: unknown = Reflect.get(model, "validateState");
      if (typeof validateState !== "function") throw new Error("没有找到完整校验探针");
      Reflect.set(model, "validateState", (...args: unknown[]) => {
        fullValidations++;
        return validateState.apply(model, args);
      });
      const prepareLocal = model.prepareLocalTranslations.bind(model);
      let idlePrepareMs = 0,
        idlePrepares = 0;
      model.prepareLocalTranslations = () => {
        const at = performance.now();
        try {
          return prepareLocal();
        } finally {
          idlePrepareMs += performance.now() - at;
          idlePrepares++;
        }
      };
      model.read = () => {
        const at = performance.now();
        if (!model.readIncrementalSnapshot()) fullReads++;
        try {
          return read();
        } finally {
          readMs += performance.now() - at;
          reads++;
        }
      };
      let mainCommitMs = 0,
        refreshMs = 0,
        roundTripMs = 0,
        candidate;
      let completeMs = 0;
      let mainPreparationMs = 0;
      let proofResult: ReturnType<FrameWorkerPrototype["commit"]> | undefined;
      try {
        const receipt =
          mode !== "sync" && worker
            ? await worker.prepare(commands, binding.board?.captureSubmission())
            : undefined;
        candidate = receipt?.candidate;
        mainPreparationMs = receipt?.mainPreparationMs ?? 0;
        roundTripMs = receipt?.roundTripMs ?? 0;
        phase = "commit";
        const commitStart = performance.now();
        binding.writing = true;
        try {
          if (receipt && worker) proofResult = worker.commit(receipt, origin);
          else if (action === "geometry") {
            const values = commands.flatMap(command =>
              command.type === "set_node" && command.patch.geometry
                ? [{ id: command.id, geometry: command.patch.geometry }]
                : []
            );
            model.tryLocalGeometries(values, origin) ?? model.submitChunks(commands, origin);
          } else model.tryLocalStructure(commands, origin) ?? model.submitChunks(commands, origin);
        } finally {
          binding.writing = false;
        }
        mainCommitMs = performance.now() - commitStart;
        phase = "projection";
        const refreshStart = performance.now();
        binding.refreshLayout();
        refreshMs = performance.now() - refreshStart;
        phase = "paint";
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        completeMs = performance.now() - start;
        performance.mark("frame-sample-visible");
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!idlePrepares) {
          model.prepareLocalTranslations();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
      } finally {
        performance.mark("frame-sample-end");
        active = false;
        cancelAnimationFrame(handle);
        model.read = read;
        model.prepareLocalTranslations = prepareLocal;
        Reflect.set(model, "validateState", validateState);
        board.renderPluginElement = renderPlugin;
        mutations.disconnect();
        binding.history.stopCapturing();
        release();
      }
      const after = model.read();
      if (
        (mode === "handoff" || mode === "incremental") &&
        (!proofResult?.snapshot || !proofResult.capacity || fullReads || fullValidations)
      )
        throw new Error("候选交接仍触发主线程全量读取或校验");
      if (action === "create") {
        const captured = after.pages[0].children.find(node => node.id === "candidate-frame");
        if (
          !captured ||
          JSON.stringify(captured.children.map(node => node.id)) !==
            JSON.stringify(page.children.map(node => node.id))
        )
          throw new Error("原型没有按顺序完整收纳已有元素");
      } else if (action === "dissolve") {
        if (
          !frame ||
          JSON.stringify(after.pages[0].children.map(node => node.id)) !==
            JSON.stringify(frame.children.map(node => node.id))
        )
          throw new Error("原型没有完整解散画框");
      } else {
        const old = new Map<string, { x: number; y: number }>();
        const collect = (node: NonNullable<typeof frame>) => {
          old.set(node.id, node.geometry);
          node.children.forEach(collect);
        };
        page.children.forEach(collect);
        const check = (node: NonNullable<typeof frame>) => {
          const expected = old.get(node.id);
          if (
            !expected ||
            node.geometry.x !== expected.x + 220 ||
            node.geometry.y !== expected.y + 40
          )
            throw new Error("原型没有平移全部子元素");
          node.children.forEach(check);
        };
        after.pages[0].children.forEach(check);
      }
      const finalScreen = screen();
      if (
        !initialScreen ||
        !finalScreen ||
        Math.abs(finalScreen.x - initialScreen.x - (action === "geometry" ? 220 : 0)) > 1 ||
        Math.abs(finalScreen.y - initialScreen.y - (action === "geometry" ? 40 : 0)) > 1
      )
        throw new Error("后台原型的真实子元素屏幕位置不正确");
      await fixture.verify();
      if (binding.history.undoStack.length !== historyBefore + 1)
        throw new Error("原型不是一个撤销项");
      binding.undo();
      if (JSON.stringify(model.read()) !== JSON.stringify(before))
        throw new Error("原型撤销没有恢复完整状态");
      await fixture.verify();
      binding.redo();
      if (JSON.stringify(model.read()) !== JSON.stringify(after))
        throw new Error("原型重做没有恢复完整状态");
      await fixture.verify();
      return {
        action,
        mode,
        renderedElements,
        movedHosts,
        movedBatches,
        retainedEditors: editors.filter(node => node.isConnected).length,
        proofResult,
        initMs,
        elements: model.elements.size,
        mainCommitMs,
        mainPreparationMs,
        refreshMs,
        readMs,
        reads,
        fullReads,
        fullValidations,
        idlePrepareMs,
        idlePrepares,
        roundTripMs,
        workerPrepareMs: candidate?.prepareMs,
        workerExecuteMs: candidate?.executeMs,
        workerValidateMs: candidate?.validateMs,
        workerProofReused: candidate?.proofReused,
        workerBaselineReused: candidate?.baselineReused,
        updateBytes: candidate?.update.byteLength,
        completeMs,
        childScreenDelta: {
          x: finalScreen.x - initialScreen.x,
          y: finalScreen.y - initialScreen.y,
        },
        maxFrameMs: Math.max(...frames),
        withinFrameBudget: Math.max(...frames) <= 20,
        longFrames,
        retainedSVG: originals.filter(node => node.isConnected).length,
      };
    },
  };
}
