export async function stressFrame(page, url, cycles, rate = 1) {
  const errors = [];
  const onError = error => errors.push(error.message);
  const onConsole = event => {
    if (event.type() === "error" && !event.text().includes("404")) errors.push(event.text());
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  let currentCycle = -1;
  const cdp = await page.context().newCDPSession(page);
  const settle = () =>
    page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
  try {
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto(url + "?mode=nested&size=900&legacy");
    await page.waitForFunction(() => window.frameBench?.ready, undefined, { timeout: 60000 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    await page.evaluate(() => {
      const { model } = window.frameBench;
      window.frameStress = {
        records: new Map(model.elements),
        title: model.text("column-a", "title"),
        count: model.elements.size,
      };
      window.addEventListener(
        "pointerdown",
        event => {
          requestAnimationFrame(() => {
            const { binding } = window.frameBench,
              state = binding.board.interactions.pointerState;
            window.frameStress.started = {
              pointer: state?.name,
              gesture: binding.gesture,
              moving: (state?.drag?.moveElements ?? state?.moveElements)?.map(node => node.id),
              target: event.target?.outerHTML?.slice(0, 180),
              point: { x: event.clientX, y: event.clientY },
            };
          });
        },
        { capture: true }
      );
    });
    const read = id => page.evaluate(id => window.frameBench.api.getElement(id), id);
    const drag = async (id, point, cancel = false) => {
      await page.evaluate(id => window.frameBench.api.select([id]), id);
      await settle();
      const node = await read(id);
      const screen = await page.evaluate(
        ({ node, point }) => ({
          start: window.frameBench.api.canvasToScreen(
            node.type === "frame"
              ? { x: node.x + 2, y: node.y + node.height * 0.35 }
              : { x: node.x + 24, y: node.y + 25 }
          ),
          end: window.frameBench.api.canvasToScreen(point),
        }),
        { node, point }
      );
      await page.keyboard.down("Alt");
      await page.mouse.move(screen.start.x, screen.start.y);
      await page.mouse.down();
      await page.mouse.move(screen.end.x, screen.end.y, { steps: 8 });
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
      await page.keyboard.up("Alt");
      await settle();
      const started = await page.evaluate(() => window.frameStress.started);
      if (!started?.moving?.includes(id))
        throw new Error("压测未启动目标拖动：" + JSON.stringify({ id, started }));
    };
    const check = async (id, parent) => {
      const actual = await page.evaluate(id => {
        const walk = (nodes, parent = null) => {
          for (const node of nodes) {
            if (node.id === id) return { found: true, parent };
            const nested = walk(node.children ?? [], node.id);
            if (nested) return nested;
          }
        };
        return walk(window.frameBench.api.children);
      }, id);
      if (!actual || actual.parent !== parent) {
        const layout = await page.evaluate(() =>
          ["frame", "column-a", "column-b", "outside"].map(id => {
            const n = window.frameBench.api.getElement(id);
            return { id, x: n.x, y: n.y, width: n.width, height: n.height };
          })
        );
        const diagnostic = await page.evaluate(
          id => ({
            physical: window.frameBench.model.elements.get(id)?.get("placement"),
            started: window.frameStress.started,
            pointer: window.frameBench.binding.board.interactions.pointerState?.name,
            geometry: window.frameBench.model.elements.get(id)?.get("geometry"),
          }),
          id
        );
        throw new Error(
          JSON.stringify({ cycle: currentCycle, id, parent, actual, layout, diagnostic })
        );
      }
    };
    await drag("column-a", { x: 162, y: 210 });
    await check("column-a", "frame");
    for (let cycle = 0; cycle < cycles; cycle++) {
      currentCycle = cycle;
      const a = await read("column-a");
      await drag("outside", { x: a.x + 50, y: a.y + 80 });
      await check("outside", "column-a");
      const column = await read("column-a");
      await drag("outside", { x: column.x + 60, y: column.y + column.height - 12 });
      await check("outside", "column-a");
      const reordered = await read("column-a");
      if (reordered.children.at(-1)?.id !== "outside") throw new Error("分栏排序没有到达末尾");
      const f = await read("frame");
      await drag("outside", { x: f.x + 350, y: f.y + 420 });
      await check("outside", "frame");
      const b = await read("column-b");
      await drag("outside", { x: b.x + 50, y: b.y + 80 });
      await check("outside", "column-b");
      await page.evaluate(() => window.frameBench.binding.undo());
      await check("outside", "frame");
      await page.evaluate(() => window.frameBench.binding.redo());
      await check("outside", "column-b");
      const source = await read("frame");
      await drag("frame", { x: source.x + 8, y: source.y + source.height * 0.35 });
      await check("column-a", "frame");
      await check("column-b", "frame");
      await page.evaluate(() => window.frameBench.binding.undo());
      await page.waitForFunction(() => {
        const { api } = window.frameBench,
          frame = api.getElement("frame");
        const rect = Array.from(document.querySelectorAll("svg[data-whiteboard-canvas] rect")).find(
          rect =>
            Math.abs(Number(rect.getAttribute("width")) - frame.width) < 0.01 &&
            Math.abs(Number(rect.getAttribute("height")) - frame.height) < 0.01
        );
        if (!rect) return false;
        const actual = new DOMPoint(rect.x.baseVal.value, rect.y.baseVal.value).matrixTransform(
          rect.getScreenCTM()
        );
        const expected = api.canvasToScreen({ x: frame.x, y: frame.y });
        return Math.abs(actual.x - expected.x) < 0.01 && Math.abs(actual.y - expected.y) < 0.01;
      });
      const snapshot = await page.evaluate(() => JSON.stringify(window.frameBench.model.read()));
      const old = await read("outside");
      await drag("outside", { x: old.x + 30, y: old.y + 20 }, true);
      const cancelled = await page.evaluate(() => JSON.stringify(window.frameBench.model.read()));
      if (snapshot !== cancelled) throw new Error("取消拖动没有完整回滚");
      await page.evaluate(() => {
        const { model, api } = window.frameBench,
          { records, title, count } = window.frameStress;
        if (model.elements.size !== count) throw new Error("元素数变化");
        for (const [id, record] of records)
          if (model.elements.get(id) !== record) throw new Error("稳定记录被替换：" + id);
        if (model.text("column-a", "title") !== title || title.toString() !== "column-a")
          throw new Error("标题根变化");
        const arrow = api.getElement("link");
        if (arrow.source.bindId !== "a1" || arrow.target.bindId !== "b1")
          throw new Error("连线绑定变化");
        const state = model.read();
        if (state.recovery.length || state.pages.some(page => page.recovery.length))
          throw new Error("元素落入恢复区");
      });
      if (errors.length) throw new Error(errors.join("\n"));
      await page.evaluate(() => window.frameBench.verify());
    }
    return {
      cycles,
      rate,
      gestures: 1 + cycles * 6,
      elements: await page.evaluate(() => window.frameBench.model.elements.size),
      errors,
    };
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
    page.off("pageerror", onError);
    page.off("console", onConsole);
  }
}

export async function stressFrameStructure(page, url, cycles = 5, rate = 4) {
  const errors = [];
  let currentCycle = -1;
  const onError = error => errors.push(error.message);
  const onConsole = event => {
    if (event.type() === "error" && !event.text().includes("404")) errors.push(event.text());
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  const cdp = await page.context().newCDPSession(page);
  const settle = () =>
    page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
  try {
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto(url + "?mode=create&size=1000&dense");
    await page.waitForFunction(() => window.frameBench?.ready, undefined, { timeout: 60000 });
    await page.evaluate(() => {
      const { model } = window.frameBench;
      window.frameStructureStress = {
        records: new Map(
          [...model.elements].map(([id, record]) => [
            id,
            {
              record,
              bindings: record.get("fieldBindings"),
            },
          ])
        ),
      };
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    for (let cycle = 0; cycle < cycles; cycle++) {
      currentCycle = cycle;
      const before = await page.evaluate(() => JSON.stringify(window.frameBench.model.read()));
      await page.evaluate(() => window.frameBench.api.setActiveTool("tau.frame.create"));
      await page.mouse.move(100, 120);
      await page.mouse.down();
      await page.mouse.move(800, 570, { steps: 24 });
      await page.mouse.up();
      await settle();
      const frame = await page.evaluate(() => {
        const frame = window.frameBench.api.children.find(node => node.type === "frame");
        if (frame?.children?.length !== 1000) throw new Error("密集收纳未保留全部元素");
        return { id: frame.id, x: frame.x, y: frame.y, height: frame.height };
      });
      await page.evaluate(() => window.frameBench.verify());
      const captured = await page.evaluate(() => JSON.stringify(window.frameBench.model.read()));
      await page.evaluate(() => window.frameBench.binding.undo());
      await page.evaluate(() => window.frameBench.verify());
      if ((await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) !== before)
        throw new Error("密集收纳撤销未恢复原状态");
      await page.evaluate(() => window.frameBench.binding.redo());
      await page.evaluate(() => window.frameBench.verify());
      if ((await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) !== captured)
        throw new Error("密集收纳重做未恢复原状态");
      await settle();
      const menuPoint = await page.evaluate(
        frame =>
          window.frameBench.api.canvasToScreen({
            x: frame.x + 2,
            y: frame.y + frame.height * 0.35,
          }),
        frame
      );
      if (menuPoint.x < 0 || menuPoint.x >= 1000 || menuPoint.y < 0 || menuPoint.y >= 700)
        throw new Error("解散入口不在视口内：" + JSON.stringify({ frame, menuPoint }));
      await page.mouse.click(menuPoint.x, menuPoint.y, { button: "right" });
      await page.getByRole("menu").getByText("解散画框", { exact: true }).click();
      await settle();
      await page.evaluate(() => window.frameBench.verify());
      if ((await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) !== before)
        throw new Error("密集解散未恢复全部元素和顺序");
      const undoDepth = await page.evaluate(
        () => window.frameBench.binding.history.undoStack.length
      );
      await page.evaluate(() => window.frameBench.binding.undo());
      await page.evaluate(() => window.frameBench.verify());
      if ((await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) !== captured)
        throw new Error("密集解散撤销未恢复画框");
      await page.evaluate(() => window.frameBench.binding.redo());
      await page.evaluate(() => window.frameBench.verify());
      await page.evaluate(depth => {
        const { model, binding, api } = window.frameBench;
        if (binding.history.undoStack.length !== depth) throw new Error("历史步骤不完整");
        if (api.children.length !== 1000 || api.children.some(node => node.type === "frame"))
          throw new Error("密集解散后仍有元素被收纳或丢失");
        for (const [id, { record, bindings }] of window.frameStructureStress.records)
          if (model.elements.get(id) !== record || record.get("fieldBindings") !== bindings)
            throw new Error("批量移动改变了记录或正文身份：" + id);
        const snapshot = model.read();
        if (snapshot.recovery.length || snapshot.pages.some(page => page.recovery.length))
          throw new Error("密集操作出现恢复节点");
      }, undoDepth);
      if ((await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) !== before)
        throw new Error("密集解散重做未恢复原状态");
      if (errors.length) throw new Error(errors.join("\n"));
    }
    return { cycles, rate, elements: 1000, structuralMoves: cycles * 2000, errors };
  } catch (error) {
    throw new Error(`密集循环 ${currentCycle}: ${error.message}`);
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
    page.off("pageerror", onError);
    page.off("console", onConsole);
  }
}

export async function stressFrameRetained(
  page,
  url,
  cycles = 5,
  rate = 4,
  fragmented = false,
  conflictsOnly = false
) {
  const errors = [];
  const onError = error => errors.push(error.message);
  const onConsole = event => {
    if (event.type() === "error" && !event.text().includes("404")) errors.push(event.text());
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  const cdp = await page.context().newCDPSession(page);
  const settle = () =>
    page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
  try {
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto(url + "?mode=create&size=1000&dense");
    await page.waitForFunction(
      () =>
        window.frameBench?.ready &&
        document.querySelectorAll("svg[data-whiteboard-canvas] svg").length === 1000
    );
    await page.evaluate(() => {
      const svgs = [...document.querySelectorAll("svg[data-whiteboard-canvas] svg")];
      const svg = svgs.find(
        node => Number(node.getAttribute("x")) === 130 && Number(node.getAttribute("y")) === 170
      );
      if (!svg || !svg.parentElement) throw new Error("没有找到状态验证的图形");
      const foreign = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      foreign.setAttribute("width", "200");
      foreign.setAttribute("height", "70");
      const body = document.createElement("div"),
        input = document.createElement("input"),
        frame = document.createElement("iframe");
      input.value = "保留未提交编辑";
      const state = { svgs, input, frame, loads: 0 };
      frame.addEventListener("load", () => state.loads++);
      frame.srcdoc = "<script>window.frameState = { retained: true };</script>";
      body.append(input, frame);
      foreign.append(body);
      svg.parentElement.append(foreign);
      state.moves = [];
      for (const method of ["insertBefore", "removeChild", "appendChild"]) {
        const original = Node.prototype[method];
        Node.prototype[method] = function (node, ...rest) {
          if (node.isConnected && node.contains(frame))
            state.moves.push({
              method,
              check: state.checks,
              tag: node.nodeName,
              host: node.closest?.("[data-element-host]")?.dataset.elementHost,
              stack: new Error().stack.split("\n").slice(1, 7),
            });
          return original.call(this, node, ...rest);
        };
      }
      window.frameRetained = state;
    });
    await page.waitForFunction(() => window.frameRetained.frame.contentWindow?.frameState);
    await page.evaluate(() => {
      const state = window.frameRetained;
      state.document = state.frame.contentDocument;
      state.marker = state.frame.contentWindow.frameState;
      state.input.focus();
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const check = async () => {
      await settle();
      await page.evaluate(() => window.frameBench.verify());
      await page.evaluate(() => {
        const s = window.frameRetained;
        s.checks = (s.checks ?? 0) + 1;
        if (document.querySelector("[data-whiteboard-stage][data-frame-drag]"))
          throw new Error("手势结束后仍有临时命中面");
        if (s.svgs.some(node => !node.isConnected)) throw new Error("归属变化重建了图形实例");
        const expected = [];
        const visit = nodes =>
          nodes.forEach(node => {
            if (node.type === "geometry") expected.push(node.id);
            if (node.children) visit(node.children);
          });
        visit(window.frameBench.api.children);
        const actual = [...document.querySelectorAll("svg[data-whiteboard-canvas] svg")].map(svg =>
          svg.closest("[data-element-host]")?.getAttribute("data-element-host")
        );
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          throw new Error("图形 DOM 绘制顺序与模型不同");
        if (document.activeElement !== (s.focus ?? s.input) || s.input.value !== "保留未提交编辑")
          throw new Error("归属变化丢失焦点或未提交编辑");
        if (
          s.frame.contentDocument !== s.document ||
          s.frame.contentWindow.frameState !== s.marker ||
          s.loads !== 1
        )
          throw new Error(
            "归属变化重新加载了 iframe " +
              JSON.stringify({
                check: s.checks,
                moves: s.moves.slice(-4),
                loads: s.loads,
                sameDocument: s.frame.contentDocument === s.document,
                sameMarker: s.frame.contentWindow.frameState === s.marker,
              })
          );
      });
      if (errors.length) throw new Error(errors.join("\n"));
    };
    for (let cycle = 0; cycle < cycles; cycle++) {
      await page.evaluate(cycle => {
        const f = window.frameBench,
          id = "retained-" + cycle;
        f.binding.submit([
          f.frameCommand(id),
          ...f.api.children.map(node => ({
            type: "move_node",
            id: node.id,
            parent: { kind: "element", id },
          })),
        ]);
      }, cycle);
      await check();
      await page.evaluate(() => window.frameBench.binding.undo());
      await check();
      await page.evaluate(() => window.frameBench.binding.redo());
      await check();
      await page.evaluate(cycle => {
        const f = window.frameBench,
          id = "retained-" + cycle;
        if (cycle === 0) {
          const board = f.binding.board,
            current = board.children.find(node => node.id === id);
          f.binding.beginGesture({ realtime: true });
          board.framePresentation.begin(current);
          board.framePresentation.move(current.x + 10, current.y + 10);
          f.binding.previewFramePosition(id, current.x + 10, current.y + 10);
          f.binding.endGesture(true);
          board.framePresentation.end();
        }
        const frame = f.api.children.find(node => node.id === id);
        if (!frame || frame.children.length !== 1000) throw new Error("未完整收纳 1000 元素");
        f.binding.submit([
          ...frame.children.map(node => ({
            type: "move_node",
            id: node.id,
            parent: { kind: "page", id: "p" },
          })),
          { type: "remove_nodes", ids: [id] },
        ]);
      }, cycle);
      await check();
      await page.evaluate(() => window.frameBench.binding.undo());
      await check();
      await page.evaluate(() => window.frameBench.binding.redo());
      await check();
    }
    let fragmentedMoves = 0;
    if (fragmented) {
      await page.evaluate(() => {
        const f = window.frameBench;
        f.binding.submit([f.frameCommand("fragment-a"), f.frameCommand("fragment-b")]);
      });
      for (let round = 0; round < 8; round++) {
        await page.evaluate(round => {
          const f = window.frameBench;
          const commands = Array.from({ length: 64 }, (_, index) => ({
            type: "move_node",
            id: `node-${(index * 17 + round * 7) % 1000}`,
            parent:
              index % 3 === 0
                ? { kind: "page", id: "p" }
                : { kind: "element", id: index % 3 === 1 ? "fragment-a" : "fragment-b" },
          }));
          f.binding.submit(commands, `fragment-${round}`);
        }, round);
        fragmentedMoves += 64;
        await check();
        await page.evaluate(() => window.frameBench.binding.undo());
        await check();
        await page.evaluate(() => window.frameBench.binding.redo());
        await check();
      }
      await page.evaluate(() => {
        const f = window.frameBench;
        const nodes = [];
        const visit = items =>
          items.forEach(node => {
            if (node.type === "geometry") nodes.push(node);
            if (node.children) visit(node.children);
          });
        visit(f.api.children);
        f.binding.submit(
          [
            f.frameCommand("fragment-all"),
            ...nodes.map(node => ({
              type: "move_node",
              id: node.id,
              parent: { kind: "element", id: "fragment-all" },
            })),
            { type: "remove_nodes", ids: ["fragment-a", "fragment-b"] },
          ],
          "fragment-capture"
        );
      });
      fragmentedMoves += 1000;
      await check();
      await page.evaluate(() => window.frameBench.binding.undo());
      await check();
      await page.evaluate(() => window.frameBench.binding.redo());
      await check();
      await page.evaluate(() => {
        const f = window.frameBench;
        const frame = f.api.children.find(node => node.id === "fragment-all");
        if (!frame || frame.children.length !== 1000) throw new Error("分裂绘制组未完整收纳");
        f.binding.submit(
          [
            ...frame.children.map(node => ({
              type: "move_node",
              id: node.id,
              parent: { kind: "page", id: "p" },
            })),
            { type: "remove_nodes", ids: [frame.id] },
          ],
          "fragment-dissolve"
        );
      });
      fragmentedMoves += 1000;
      await check();
      await page.evaluate(() => window.frameBench.binding.undo());
      await check();
      await page.evaluate(() => window.frameBench.binding.redo());
      await check();
    }
    let remoteTransitions = 0,
      activeCancels = 0;
    if (fragmented || conflictsOnly) {
      const dragPeerFrame = async () => {
        const point = await page.evaluate(() => {
          const frame = window.frameBench.api.getElement("peer-frame");
          return { x: frame.x + 10, y: frame.y + frame.height / 2 };
        });
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(point.x + 10, point.y + 10, { steps: 4 });
        await page.evaluate(() => {
          window.frameRetained.focus = document.activeElement;
        });
      };
      await page.evaluate(() => {
        const f = window.frameBench;
        f.binding.submit(
          [
            f.frameCommand("peer-frame"),
            ...f.api.children.map(node => ({
              type: "move_node",
              id: node.id,
              parent: { kind: "element", id: "peer-frame" },
            })),
          ],
          "peer-capture"
        );
      });
      await check();
      if (
        conflictsOnly &&
        (await page.evaluate(
          () =>
            window.frameBench.dragVariant === "configured" ||
            ["commit", "frames"].includes(window.frameBench.dragProbe?.hitMode)
        ))
      ) {
        const initial = await page.evaluate(() => JSON.stringify(window.frameBench.model.read()));
        await page.evaluate(() => {
          const f = window.frameBench;
          if (f.dragVariant !== "configured" && f.dragProbe?.hitMode !== "commit") return;
          const slow = tx => {
            if (!f.binding.gestureHistory || tx.origin !== f.binding.gestureHistory) return;
            const end = performance.now() + 16;
            while (performance.now() < end) {
              /* 仅隔离中断压力 */
            }
          };
          f.model.doc.on("afterTransaction", slow);
          window.frameRetained.endSlow = () => f.model.doc.off("afterTransaction", slow);
        });
        await dragPeerFrame();
        const point = await page.evaluate(() => {
          const frame = window.frameBench.api.getElement("peer-frame");
          return { x: frame.x + 10, y: frame.y + frame.height / 2 };
        });
        let active = false;
        for (let i = 0; i < 80 && !active; i++) {
          await page.mouse.move(point.x + (i % 2), point.y);
          // 只在中断压力中制造错过刷新，确保取消实际经过已启用的命中面。
          active = await page.evaluate(
            () =>
              new Promise(resolve =>
                requestAnimationFrame(() => {
                  const until = performance.now() + 32;
                  while (performance.now() < until) {
                    /* 占用当前绘制机会 */
                  }
                  resolve(!!document.querySelector("[data-whiteboard-stage][data-frame-drag]"));
                })
              )
          );
        }
        await page.evaluate(() => window.frameRetained.endSlow?.());
        if (!active) throw new Error("未进入待验证的降载命中状态");
        if (
          !(await page.evaluate(
            ({ x, y }) =>
              document.elementFromPoint(x, y) === document.querySelector("[data-whiteboard-stage]"),
            point
          ))
        )
          throw new Error("已启用的命中面未接管指针所在位置");
        await page.keyboard.press("Escape");
        await page.mouse.up();
        await check();
        if ((await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) !== initial)
          throw new Error("降载拖动取消后仍留下几何写入");
        activeCancels++;
      }
      await page.evaluate(() => {
        const f = window.frameBench;
        const frame = f.api.getElement("peer-frame");
        const state = window.frameRetained;
        state.peerBefore = [frame, ...frame.children].map(node => ({
          id: node.id,
          geometry: {
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            rotation: node.rotation ?? 0,
          },
        }));
        const start = state.svgs[0].getScreenCTM();
        state.peerStart = { x: start.e, y: start.f };
      });
      await dragPeerFrame();
      await page.evaluate(async () => {
        const f = window.frameBench,
          state = window.frameRetained;
        await f.remote(
          state.peerBefore.map(node => ({
            type: "set_node",
            id: node.id,
            patch: {
              geometry: { ...node.geometry, x: node.geometry.x + 20, y: node.geometry.y + 20 },
            },
          }))
        );
      });
      await page.mouse.up();
      await check();
      await page.evaluate(() => {
        const f = window.frameBench,
          s = window.frameRetained;
        for (const old of s.peerBefore) {
          const node = f.api.getElement(old.id);
          if (!node || node.x !== old.geometry.x + 20 || node.y !== old.geometry.y + 20)
            throw new Error("远端位置被活动画框或迟到松手覆盖");
        }
        const matrix = s.svgs[0].getScreenCTM();
        if (
          Math.abs(matrix.e - s.peerStart.x - 20) > 1 ||
          Math.abs(matrix.f - s.peerStart.y - 20) > 1
        )
          throw new Error("远端位置与绘制组实际屏幕位移不一致");
      });
      remoteTransitions++;
      await dragPeerFrame();
      await page.evaluate(async () => {
        const f = window.frameBench;
        const frame = f.api.getElement("peer-frame");
        await f.remote([
          ...frame.children.map(node => ({
            type: "move_node",
            id: node.id,
            parent: { kind: "page", id: "p" },
          })),
          { type: "remove_nodes", ids: [frame.id] },
        ]);
      });
      await page.mouse.up();
      await check();
      await page.evaluate(() => {
        const f = window.frameBench,
          s = window.frameRetained;
        if (f.api.children.some(node => node.id === "peer-frame"))
          throw new Error("迟到松手恢复了远端解散的画框");
        const matrix = s.svgs[0].getScreenCTM();
        if (
          Math.abs(matrix.e - s.peerStart.x - 20) > 1 ||
          Math.abs(matrix.f - s.peerStart.y - 20) > 1
        )
          throw new Error("远端解散后绘制组仍残留本机位移");
      });
      remoteTransitions++;
    }
    return {
      cycles,
      rate,
      elements: 1000,
      structuralMoves: cycles * 2000,
      fragmentedMoves,
      remoteTransitions,
      activeCancels,
      svgInstancesRetained: 1000,
      focusRetained: true,
      iframeLoads: 1,
      errors,
    };
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
    page.off("pageerror", onError);
    page.off("console", onConsole);
  }
}
