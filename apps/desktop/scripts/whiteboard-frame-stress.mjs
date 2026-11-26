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
