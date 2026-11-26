import {
  stressFrame,
  stressFrameStructure,
  stressFrameRetained,
} from "./whiteboard-frame-stress.mjs";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwind from "@tailwindcss/vite";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir, loadavg, cpus } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";

// 通过 CLI 运行浏览器，便于复用现有 Playwright 会话与工具安装。
async function sample(page, url, cases, rounds, options = {}) {
  const {
    verify = false,
    profile = false,
    cadence = false,
    labels = false,
    rafInput = false,
    steps = 48,
    settleMs = 0,
    preselect = false,
    assertFps = false,
    warmup = 0,
    dense = false,
    trace = false,
    inputControl = false,
  } = options;
  await page.setViewportSize({ width: 1000, height: 700 });
  const results = (page.frameResults = []);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text());
  });
  const cdp = await page.context().newCDPSession(page);
  const browser = await cdp.send("Browser.getVersion");
  await cdp.send("Performance.enable");
  try {
    const comparisons = (options.dragVariants ?? ["configured"]).flatMap(variant =>
      (options.renderers ?? ["configured"]).map(renderer => ({ renderer, variant }))
    );
    for (const [action, size, mode, rate] of cases) {
      let reuseReady = false;
      if (
        options.reuseBoard &&
        (action !== "drag" ||
          !verify ||
          profile ||
          trace ||
          inputControl ||
          comparisons.some(
            c => !["scope", "budget-scope"].includes(c.variant) || c.renderer !== "individual"
          ))
      )
        throw new Error("同板配对需要普通渲染、长拖动验证及未附加性能分析器的基线与慢提交方案");
      for (let round = 0; round < rounds; round++)
        for (const { renderer, variant } of options.dragVariants && round % 2
          ? [...comparisons].reverse()
          : comparisons) {
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
          if (!options.reuseBoard || !reuseReady)
            await page.goto(
              `${url}?size=${size}&mode=${mode}${labels ? "&labels" : ""}${dense ? "&dense" : ""}${renderer.startsWith("flat") ? "&flat-frames" : ""}&drag-variant=${variant}`
            );
          await page
            .waitForFunction(
              () =>
                window.frameBench?.ready && document.querySelector("svg[data-whiteboard-canvas]")
            )
            .catch(error => {
              throw new Error(
                JSON.stringify({ action, size, mode, round, errors, reason: error.message })
              );
            });
          const seeded =
            options.seedGeometryBytes && !reuseReady
              ? await page.evaluate(
                  bytes => window.frameBench.seedGeometryBytes(bytes),
                  options.seedGeometryBytes
                )
              : undefined;
          if (options.reuseBoard) {
            await page.evaluate(v => window.setBenchGeometryVariant(v), variant);
            reuseReady = true;
          }
          await page.bringToFront();
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
          await page.evaluate(
            () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          );
          const initialReadyMs = await page.evaluate(() => performance.now());
          const before = await page.evaluate(() => window.frameBench.api.children);
          const beforeViewport = await page.evaluate(() => window.frameBench.api.viewPort);
          if (
            action === "resize" ||
            action === "dissolve" ||
            action === "fit" ||
            (preselect && action === "drag")
          )
            await page.evaluate(() => window.frameBench.api.select(["frame"]));
          if (action === "create")
            await page.evaluate(mode => {
              const { api } = window.frameBench;
              if (mode === "column" || mode === "mind") {
                api.apply({ type: "remove_node", path: [0], node: api.children[0] });
                api.updateElement("outside", { x: 200 });
              }
              api.setActiveTool("tau.frame.create");
            }, mode);
          await page.evaluate(
            () =>
              new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          );
          const baseline = verify
            ? await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))
            : null;
          if (inputControl)
            await page.evaluate(() => {
              const { board } = window.frameBench.binding;
              const root = board.framePresentation.roots.get("frame");
              if (!root) throw new Error("输入控制组没有找到画框显示组");
              let start;
              window.addEventListener(
                "pointerdown",
                event => {
                  start = { x: event.clientX, y: event.clientY };
                  event.stopPropagation();
                },
                true
              );
              window.addEventListener(
                "pointermove",
                event => {
                  if (start) {
                    const dx = event.clientX - start.x,
                      dy = event.clientY - start.y;
                    if (Math.hypot(dx, dy) > 5)
                      root.group.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                  }
                  event.stopPropagation();
                },
                true
              );
              window.addEventListener(
                "pointerup",
                event => {
                  event.stopPropagation();
                },
                true
              );
            });
          await cdp.send("Emulation.setCPUThrottlingRate", { rate });
          const hostStart = options.quietHost
            ? await page.evaluate(async () => {
                const response = await fetch("/__frame-worker-progress?phase=before-sample");
                return (await response.json()).start;
              })
            : undefined;
          const measurementOptions = {
            action,
            profile,
            trace,
            observeSurface: options.observeSurface,
          };
          await page.evaluate(({ action, profile, trace, observeSurface }) => {
            const fixture = window.frameBench;
            const events = new AbortController(),
              restoreMethods = [];
            fixture.wallInputs = undefined;
            fixture.wallSender = undefined;
            fixture.inputDurationMs = undefined;
            let hitSurfaceActivations = 0;
            const surfaceObserver =
              observeSurface && action === "drag"
                ? new MutationObserver(records => {
                    for (const record of records)
                      if (record.oldValue === null) hitSurfaceActivations++;
                  })
                : null;
            if (surfaceObserver)
              surfaceObserver.observe(document.querySelector("[data-whiteboard-stage]"), {
                attributes: true,
                attributeOldValue: true,
                attributeFilter: ["data-frame-drag"],
              });
            const originalNodes = [...document.querySelectorAll("svg[data-whiteboard-canvas] svg")];
            const originalLabels = document.querySelectorAll(
              "svg[data-whiteboard-canvas] foreignObject"
            ).length;
            const child = action === "drag" ? fixture.api.getElement("node-0") : null;
            const childSvg = child
              ? originalNodes.find(
                  svg =>
                    Number(svg.getAttribute("x")) === child.x &&
                    Number(svg.getAttribute("y")) === child.y &&
                    Number(svg.getAttribute("width")) === child.width
                )
              : null;
            const childPosition = () =>
              childSvg?.isConnected
                ? new DOMPoint(0, 0).matrixTransform(childSvg.getScreenCTM())
                : null;
            const initialChildPosition = childPosition();
            const stages = {},
              intervals = [],
              proofEvents = [],
              stageCalls = {};
            const geometryBatches = [];
            let batch;
            const phaseListeners = [];
            if (profile && action === "drag") {
              for (const event of [
                "beforeTransaction",
                "beforeObserverCalls",
                "afterTransactionCleanup",
                "update",
              ]) {
                const listener = () => {
                  if (batch && batch[event] === undefined)
                    batch[event] = performance.now() - batch.start;
                };
                fixture.model.doc.on(event, listener);
                phaseListeners.push([event, listener]);
              }
            }
            const orderWrites = { calls: 0, references: 0 };
            if (profile)
              for (const order of fixture.model.orders.values()) {
                const insert = order.insert;
                const owned = Object.hasOwn(order, "insert");
                restoreMethods.push(() => {
                  if (owned) order.insert = insert;
                  else delete order.insert;
                });
                order.insert = function (index, references) {
                  orderWrites.calls++;
                  orderWrites.references += references.length;
                  return insert.call(this, index, references);
                };
              }
            for (const [object, names, prefix] of [
              [
                fixture.binding.board,
                ["apply", "moveElement", "getBounds", "publishDocument"],
                "board",
              ],
              [
                fixture.model,
                [
                  "submit",
                  "submitChunks",
                  "preflight",
                  "validateState",
                  "assertBudget",
                  "read",
                  "prepareLocalTranslations",
                  "tryLocalGeometries",
                  "tryLocalStructure",
                  "publishGeometryStructure",
                  "createUndoManager",
                  ...(profile ? ["planCommands", "execute"] : []),
                ],
                "model",
              ],
              [
                fixture.binding,
                ["endGesture", "previewFramePosition", "flushFramePosition"],
                "binding",
              ],
              [fixture.binding.board.framePresentation, ["end", "rendered"], "presentation"],
            ])
              for (const name of names) {
                const original = object[name];
                if (typeof original !== "function") continue;
                const owned = Object.hasOwn(object, name);
                restoreMethods.push(() => {
                  if (owned) object[name] = original;
                  else delete object[name];
                });
                object[name] = function (...args) {
                  const start = performance.now();
                  if (profile && name === "tryLocalGeometries")
                    batch = { start, size: args[0].length };
                  try {
                    if (name === "prepareLocalTranslations")
                      proofEvents.push({
                        proof: this.translationBudget,
                        roots: this.doc.share.size,
                        revision: this.revision,
                      });
                    const result = original.apply(this, args);
                    if (name === "tryLocalGeometries" || name === "tryLocalStructure")
                      proofEvents.push({
                        isolated: result?.isolated,
                        proof: this.translationBudget,
                        roots: this.doc.share.size,
                        revision: this.revision,
                      });
                    return result;
                  } finally {
                    const key = prefix + "." + name;
                    if (profile) stageCalls[key] = (stageCalls[key] ?? 0) + 1;
                    const end = performance.now();
                    if (batch && name === "tryLocalGeometries") {
                      geometryBatches.push({ ...batch, total: end - start });
                      batch = undefined;
                    }
                    stages[key] = (stages[key] ?? 0) + end - start;
                    if (action === "drag" && end - start >= 1) intervals.push({ key, start, end });
                  }
                };
              }
            const frames = [],
              motion = [],
              longFrameRecords = [],
              inputs = [],
              positions = [];
            let up;
            let latestInput,
              crossedThreshold = false,
              inputFrames = 0,
              lateInputFrames = 0,
              childMismatchFrames = 0;
            fixture.scheduledInputs = [];
            let previousMotion,
              firstMotionMs,
              displayed = 0,
              down;
            const presentationSteps = [];
            const presentation = fixture.binding.board.framePresentation;
            let lastPhase;
            const stopPhases =
              action === "drag" && (trace || profile)
                ? presentation.subscribe(() => {
                    const phase = presentation.isMoving() ? "moving" : presentation.rebasePhase();
                    if (phase === lastPhase) return;
                    lastPhase = phase;
                    presentationSteps.push({ phase, at: performance.now() });
                    performance.mark("frame-drag-phase-" + phase);
                  })
                : undefined;
            const target = fixture.api.children.find(node => node.id === "frame");
            const rect =
              action === "drag" && target
                ? Array.from(document.querySelectorAll("svg[data-whiteboard-canvas] rect")).find(
                    rect =>
                      Number(rect.getAttribute("x")) === target.x &&
                      Number(rect.getAttribute("y")) === target.y &&
                      Number(rect.getAttribute("width")) === target.width
                  )
                : null;
            if (action === "drag" && !rect) throw new Error("没有找到实际画框矩形");
            const position = () =>
              rect
                ? new DOMPoint(rect.x.baseVal.value, rect.y.baseVal.value).matrixTransform(
                    rect.getScreenCTM()
                  )
                : null;
            let last = position();
            const initial = last;
            let downPoint;
            window.addEventListener(
              "pointerdown",
              event => {
                down = event.timeStamp;
                if (action === "drag") performance.mark("frame-drag-down");
                downPoint = { x: event.clientX, y: event.clientY };
              },
              { once: true, capture: true, signal: events.signal }
            );
            window.addEventListener(
              "pointermove",
              event => {
                if (down !== undefined && up === undefined) {
                  const input = {
                    t: event.timeStamp - down,
                    observed: performance.now() - down,
                    x: event.clientX,
                    y: event.clientY,
                  };
                  inputs.push(input);
                  if (downPoint && Math.hypot(input.x - downPoint.x, input.y - downPoint.y) > 5)
                    crossedThreshold = true;
                  if (crossedThreshold) latestInput = input;
                }
              },
              { capture: true, signal: events.signal }
            );
            let previous, handle;
            function tick(t) {
              if (previous !== undefined) {
                const delta = t - previous;
                frames.push(delta);
                if (delta > 22)
                  longFrameRecords.push({
                    delta,
                    at: down === undefined ? null : t - down,
                    phase:
                      down === undefined ? "before-down" : up === undefined ? "drag" : "after-up",
                  });
              }
              previous = t;
              if (rect) {
                const next = position();
                const childNow = childPosition();
                if (
                  childNow &&
                  initialChildPosition &&
                  initial &&
                  (Math.abs(childNow.x - initialChildPosition.x - next.x + initial.x) > 0.01 ||
                    Math.abs(childNow.y - initialChildPosition.y - next.y + initial.y) > 0.01)
                )
                  childMismatchFrames++;
                if (latestInput && initial && downPoint) {
                  inputFrames++;
                  if (
                    Math.abs(next.x - initial.x - latestInput.x + downPoint.x) > 0.01 ||
                    Math.abs(next.y - initial.y - latestInput.y + downPoint.y) > 0.01
                  )
                    lateInputFrames++;
                }
                if (next.x !== last.x || next.y !== last.y) {
                  displayed++;
                  const now = performance.now() - (down ?? 0);
                  const source = inputs.find(
                    input =>
                      initial &&
                      downPoint &&
                      Math.abs(input.x - downPoint.x - (next.x - initial.x)) < 0.01 &&
                      Math.abs(input.y - downPoint.y - (next.y - initial.y)) < 0.01
                  );
                  const sent = fixture.scheduledInputs.find(
                    point =>
                      initial &&
                      downPoint &&
                      Math.abs(point.x - downPoint.x - next.x + initial.x) < 0.01 &&
                      Math.abs(point.y - downPoint.y - next.y + initial.y) < 0.01
                  );
                  positions.push({
                    t: now,
                    x: next.x,
                    y: next.y,
                    inputToVisualMs: source ? now - source.t : undefined,
                    senderToVisualMs: sent ? performance.now() - sent.at : undefined,
                  });
                  if (down !== undefined && firstMotionMs === undefined)
                    firstMotionMs = performance.now() - down;
                  if (previousMotion !== undefined) motion.push(t - previousMotion);
                  previousMotion = t;
                  last = next;
                }
              }
              handle = requestAnimationFrame(tick);
            }
            handle = requestAnimationFrame(tick);
            let releaseMs;
            window.addEventListener(
              "pointerup",
              event => {
                up = event.timeStamp;
                if (action === "drag") performance.mark("frame-drag-up");
                requestAnimationFrame(() => {
                  releaseMs = performance.now() - event.timeStamp;
                });
              },
              { once: true, capture: true, signal: events.signal }
            );
            fixture.stop = () => {
              cancelAnimationFrame(handle);
              fixture.stop = undefined;
              events.abort();
              for (const restore of restoreMethods) restore();
              surfaceObserver?.disconnect();
              if (action === "drag") performance.mark("frame-drag-sampling-end");
              stopPhases?.();
              for (const [evt, fn] of phaseListeners) fixture.model.doc.off(evt, fn);
              frames.sort((a, b) => a - b);
              motion.sort((a, b) => a - b);
              if (fixture.wallInputs && downPoint && initial) {
                for (const position of positions) {
                  const sent = fixture.wallInputs.find(
                    point =>
                      Math.abs(point.x - downPoint.x - position.x + initial.x) < 0.01 &&
                      Math.abs(point.y - downPoint.y - position.y + initial.y) < 0.01
                  );
                  if (sent) position.senderToVisualMs = down + position.t - sent.at;
                }
              }
              const sentPoints = (fixture.wallInputs ?? fixture.scheduledInputs).map(point => ({
                x: point.x,
                y: point.y,
                t: point.at - down,
              }));
              // 单调轨迹上，合并输入的延迟量到首个抵达或超过目标的真实屏幕位置。
              const reachedLags = [];
              let displayedIndex = 0;
              if (action === "drag" && initial && downPoint) {
                for (const point of sentPoints) {
                  if (Math.hypot(point.x - downPoint.x, point.y - downPoint.y) <= 5) continue;
                  while (
                    displayedIndex < positions.length &&
                    positions[displayedIndex].x - initial.x < point.x - downPoint.x - 0.01
                  )
                    displayedIndex++;
                  if (displayedIndex < positions.length)
                    reachedLags.push(positions[displayedIndex].t - point.t);
                }
              }
              reachedLags.sort((a, b) => a - b);
              const lags = positions
                .map(position => position.inputToVisualMs)
                .filter(value => value !== undefined)
                .sort((a, b) => a - b);
              return {
                sentPoints,
                presentationSteps: presentationSteps.map(step => ({ ...step, at: step.at - down })),
                reachedInputs: reachedLags.length,
                maxTimeToReachMs: reachedLags.at(-1),
                p95TimeToReachMs: reachedLags[Math.ceil(reachedLags.length * 0.95) - 1],
                p95InputToVisualMs: lags[Math.ceil(lags.length * 0.95) - 1],
                maxInputToVisualMs: Math.max(0, ...lags),
                displayed,
                senderMatchedPositions: positions.filter(
                  point => point.senderToVisualMs !== undefined
                ).length,
                childMismatchFrames,
                selectedAfterGesture: fixture.binding.board.selection.selectedElements.map(
                  node => node.id
                ),
                pendingAtEnd:
                  fixture.binding.gesture ||
                  fixture.binding.board.framePresentation.isMoving() ||
                  fixture.binding.board.framePresentation.isRebasing(),
                surfaceAfterGesture: document
                  .querySelector("[data-whiteboard-stage]")
                  ?.hasAttribute("data-frame-drag"),
                firstMotionMs,
                longFrameRecords,
                inputs,
                positions,
                p95MotionMs: motion[Math.ceil(motion.length * 0.95) - 1],
                maxMotionMs: Math.max(0, ...motion),
                maxObservedMotionMs: positions.reduce(
                  (max, point, index) =>
                    index ? Math.max(max, point.t - positions[index - 1].t) : max,
                  0
                ),
                frames: frames.length,
                inputDurationMs: fixture.inputDurationMs,
                inputFreshness: { checkedFrames: inputFrames, lateFrames: lateInputFrames },
                maxSenderToVisualMs: Math.max(
                  0,
                  ...positions.map(point => point.senderToVisualMs ?? 0)
                ),
                p95: frames[Math.ceil(frames.length * 0.95) - 1],
                max: Math.max(0, ...frames),
                longFrames: frames.filter(t => t >= 50).length,
                releaseMs,
                upAt: up - down,
                wallSender: fixture.wallSender,
                intervals: intervals.map(({ key, start, end }) => ({
                  key,
                  start: start - down,
                  end: end - down,
                })),
                stages,
                ...(profile ? { stageCalls } : {}),
                ...(profile ? { orderWrites } : {}),
                proofEvents,
                dragProbe: fixture.dragProbe,
                ...(surfaceObserver ? { hitSurfaceActivations } : {}),
                ...(geometryBatches.length ? { geometryBatches } : {}),
                childScreenDelta:
                  initialChildPosition && childPosition()
                    ? {
                        x: childPosition().x - initialChildPosition.x,
                        y: childPosition().y - initialChildPosition.y,
                      }
                    : undefined,
                domNodes: {
                  before: originalNodes.length,
                  retained: originalNodes.filter(node => node.isConnected).length,
                  after: document.querySelectorAll("svg[data-whiteboard-canvas] svg").length,
                  labelContainersBefore: originalLabels,
                  labelContainersAfter: document.querySelectorAll(
                    "svg[data-whiteboard-canvas] foreignObject"
                  ).length,
                },
                seedBody: fixture.model.elements.has("node-0")
                  ? fixture.model.richText("node-0").read()
                  : undefined,
              };
            };
          }, measurementOptions);
          if (profile) {
            await cdp.send("Profiler.enable");
            await cdp.send("Profiler.start");
          }
          if (trace)
            await cdp.send("Tracing.start", {
              categories: "devtools.timeline,blink.user_timing",
              transferMode: "ReturnAsStream",
            });
          const metrics = async () =>
            (await cdp.send("Performance.getMetrics")).metrics.find(
              row => row.name === "TaskDuration"
            ).value * 1000;
          const startTask = await metrics();
          if (action === "fit" || action === "dissolve") {
            await page.mouse.click(110, 350, { button: "right" });
            await page
              .getByRole("menu")
              .getByText(action === "fit" ? "自适应内容" : "解散画框", { exact: true })
              .click();
          } else if (action === "zoom") {
            await page.mouse.move(450, 350);
            await page.keyboard.down("Control");
            for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -2);
            await page.keyboard.up("Control");
          } else {
            const [x, y, dx, dy] =
              action === "drag"
                ? [110, 350, 220, 40]
                : action === "entry"
                  ? [700, 270, -300, 0]
                  : action === "resize"
                    ? [100, 120, -60, -40]
                    : action === "create"
                      ? [100, 120, 700, 450]
                      : action === "pan"
                        ? [800, 600, 180, 40]
                        : action === "exit"
                          ? [145, 185, -130, 0]
                          : [145, 185, 200, 30];
            await page.keyboard.down("Alt");
            await page.mouse.move(x, y);
            const button = action === "pan" ? "right" : "left";
            await page.mouse.down({ button });
            if (rafInput) {
              const name = "frameInput" + Date.now() + "_" + round;
              await page.exposeFunction(name, point =>
                cdp.send("Input.dispatchMouseEvent", {
                  type: "mouseMoved",
                  ...point,
                  buttons: button === "left" ? 1 : 2,
                  modifiers: 1,
                })
              );
              await page.evaluate(
                ({ name, x, y, dx, dy, steps }) =>
                  new Promise((resolve, reject) => {
                    let step = 0;
                    const started = performance.now();
                    const pending = [];
                    const next = () => {
                      step++;
                      const point = { x: x + (dx * step) / steps, y: y + (dy * step) / steps };
                      window.frameBench.scheduledInputs.push({ ...point, at: performance.now() });
                      pending.push(window[name](point));
                      if (step < steps) requestAnimationFrame(next);
                      else
                        Promise.all(pending).then(() => {
                          window.frameBench.inputDurationMs = performance.now() - started;
                          resolve();
                        }, reject);
                    };
                    requestAnimationFrame(next);
                  }),
                { name, x, y, dx, dy, steps }
              );
              await page.mouse.move(x + dx, y + dy);
            } else if (cadence) {
              const pending = [],
                sent = [];
              const phaseOffsetMs = options.alignCadence ? (round % 2 ? 4 : 12) : undefined;
              let start = Date.now();
              if (phaseOffsetMs !== undefined) {
                const vsync = await page.evaluate(
                  () =>
                    new Promise(resolve =>
                      requestAnimationFrame(t => resolve(performance.timeOrigin + t))
                    )
                );
                const period = 1000 / 60;
                start =
                  vsync +
                  phaseOffsetMs +
                  Math.ceil((Date.now() - vsync - phaseOffsetMs) / period) * period;
              }
              for (let i = 1; i <= steps; i++) {
                await new Promise(resolve =>
                  setTimeout(resolve, Math.max(0, start + (i * 1000) / 60 - Date.now()))
                );
                sent.push({ x: x + (dx * i) / steps, y: y + (dy * i) / steps, at: Date.now() });
                pending.push(
                  cdp.send("Input.dispatchMouseEvent", {
                    type: "mouseMoved",
                    x: x + (dx * i) / steps,
                    y: y + (dy * i) / steps,
                    buttons: button === "left" ? 1 : 2,
                    modifiers: 1,
                  })
                );
              }
              await Promise.all(pending);
              const actual = Date.now() - start;
              const wallSender = {
                phaseOffsetMs,
                lastSendMs: sent.at(-1).at - start,
                firstSendMs: sent[0].at - start,
                drainMs: actual - (sent.at(-1).at - start),
              };
              await page.evaluate(
                ({ actual, sent, wallSender }) => {
                  window.frameBench.wallSender = wallSender;
                  window.frameBench.inputDurationMs = actual;
                  window.frameBench.wallInputs = sent.map(point => ({
                    ...point,
                    at: point.at - performance.timeOrigin,
                  }));
                },
                { actual, sent, wallSender }
              );
              await page.mouse.move(x + dx, y + dy);
            } else await page.mouse.move(x + dx, y + dy, { steps });
            await page.mouse.up({ button });
            await page.keyboard.up("Alt");
          }
          await page.evaluate(
            () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          );
          if (settleMs)
            await page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), settleMs);
          const taskMs = (await metrics()) - startTask;
          const measurement = await page.evaluate(() => window.frameBench.stop());
          let timeline, gestureMarks, dispatches;
          if (trace) {
            const finished = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
            await cdp.send("Tracing.end");
            const { stream } = await finished;
            let payload = "";
            for (;;) {
              const chunk = await cdp.send("IO.read", { handle: stream });
              payload += chunk.data;
              if (chunk.eof) break;
            }
            await cdp.send("IO.close", { handle: stream });
            const events = JSON.parse(payload).traceEvents;
            const mainThreads = new Set(
              events
                .filter(
                  event => event.name === "thread_name" && event.args?.name === "CrRendererMain"
                )
                .map(event => `${event.pid}:${event.tid}`)
            );
            const marks = events.filter(event =>
              ["frame-drag-down", "frame-drag-up"].includes(event.name)
            );
            const start = marks.find(event => event.name === "frame-drag-down")?.ts;
            const release = marks.find(event => event.name === "frame-drag-up")?.ts;
            const samplingEnd = events.find(event => event.name === "frame-drag-sampling-end")?.ts;
            gestureMarks = {
              stop: samplingEnd,
              down: start,
              up: release,
              rebase: events.find(
                event => event.name === "frame-drag-phase-2" && event.ts >= release
              )?.ts,
              settled: events.find(
                event => event.name === "frame-drag-phase-0" && event.ts >= release
              )?.ts,
            };
            dispatches = events
              .filter(
                event =>
                  event.name === "EventDispatch" &&
                  ["pointerdown", "pointerup"].includes(event.args?.data?.type) &&
                  mainThreads.has(`${event.pid}:${event.tid}`)
              )
              .map(event => ({ type: event.args.data.type, ms: event.dur / 1000 }));
            const durations = new Map();
            for (const event of events) {
              if (event.ph !== "X" || !mainThreads.has(`${event.pid}:${event.tid}`)) continue;
              if (samplingEnd !== undefined && event.ts >= samplingEnd) continue;
              const at = Math.min(event.ts + event.dur, samplingEnd ?? Infinity);
              const phase =
                start === undefined
                  ? "all"
                  : at < start
                    ? "before"
                    : at < release
                      ? "drag"
                      : "release";
              const key = phase === "all" ? event.name : phase + "." + event.name;
              const entry = durations.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
              entry.count++;
              const duration = (at - event.ts) / 1000;
              entry.totalMs += duration;
              entry.maxMs = Math.max(entry.maxMs, duration);
              durations.set(key, entry);
            }
            timeline = [...durations]
              .map(([name, value]) => ({ name, ...value }))
              .sort((a, b) => b.totalMs - a.totalMs);
          }
          let hotFunctions, releaseFunctions, rebaseFunctions;
          if (profile) {
            const { profile: cpu } = await cdp.send("Profiler.stop");
            const nodes = new Map(cpu.nodes.map(node => [node.id, node]));
            const times = new Map(),
              released = new Map(),
              rebased = new Map();
            let at = cpu.startTime;
            cpu.samples?.forEach((id, index) => {
              const delta = cpu.timeDeltas[index];
              at += delta;
              if (gestureMarks?.stop && at > gestureMarks.stop) return;
              times.set(id, (times.get(id) ?? 0) + delta / 1000);
              if (gestureMarks?.up && at >= gestureMarks.up)
                released.set(id, (released.get(id) ?? 0) + delta / 1000);
              if (at >= gestureMarks?.rebase && at <= gestureMarks?.settled)
                rebased.set(id, (rebased.get(id) ?? 0) + delta / 1000);
            });
            const hottest = map =>
              [...map]
                .map(([id, ms]) => ({
                  name: nodes.get(id).callFrame.functionName,
                  ms: +ms.toFixed(1),
                  line: nodes.get(id).callFrame.lineNumber,
                }))
                .sort((a, b) => b.ms - a.ms)
                .slice(0, 25);
            hotFunctions = hottest(times);
            releaseFunctions = hottest(released);
            rebaseFunctions = hottest(rebased);
          }
          const after = await page.evaluate(() => window.frameBench.api.children);
          const afterViewport = await page.evaluate(() => window.frameBench.api.viewPort);
          const frame = after.find(node => node.id === "frame");
          const flat = nodes => nodes.flatMap(node => [node, ...flat(node.children ?? [])]);
          const moved = flat(after).find(
            node => node.id === (action === "entry" ? "outside" : "node-0")
          );
          const from = flat(before).find(node => node.id === "node-0");
          const outcome = {
            beforeViewport,
            afterViewport,
            rootCount: after.length,
            frameChildren: frame?.children?.length,
            frameX: frame?.x,
            frameWidth: frame?.width,
            childDx: from && moved ? moved.x - from.x : undefined,
            outsideDx:
              action === "entry" && moved
                ? moved.x - flat(before).find(node => node.id === "outside").x
                : undefined,
            outsideInFrame: (frame ?? after.find(node => node.type === "frame"))?.children?.some(
              node => node.id === "outside"
            ),
            createdFrameChildren:
              action === "create"
                ? after.find(node => node.type === "frame")?.children?.length
                : undefined,
            committedFrameX: await page.evaluate(
              () => window.frameBench.model.elements.get("frame")?.get("geometry")?.x
            ),
          };
          let failure, fpsFailure;
          if (verify) await page.evaluate(() => window.frameBench.verify());
          if (assertFps && action === "drag") {
            const expected = steps - Math.floor((5 * steps) / Math.hypot(220, 40));
            if (
              measurement.max > 20 ||
              measurement.maxMotionMs > 20 ||
              measurement.maxObservedMotionMs > 20 ||
              measurement.displayed < expected ||
              ((rafInput || cadence) && measurement.reachedInputs !== expected) ||
              measurement.maxInputToVisualMs > 34 ||
              measurement.maxSenderToVisualMs > 34 ||
              measurement.maxTimeToReachMs > 34 ||
              ((rafInput || cadence) && measurement.inputDurationMs > (steps * 1000) / 60 + 100)
            )
              fpsFailure = "未达到逐帧位移与输入延迟的 60 FPS 门槛";
          }
          if (action === "dissolve" && frame) failure = "画框未实际解散";
          if (action === "pan" && Math.abs(afterViewport.minX - beforeViewport.minX) < 100)
            failure = "画布没有实际平移";
          if (action === "zoom" && Math.abs(afterViewport.zoom - beforeViewport.zoom) < 0.01)
            failure = "画布没有实际缩放";
          if (action === "drag" && !inputControl && Math.abs(frame.x - 320) > 1)
            failure = "画框没有实际移动";
          if (
            action === "drag" &&
            (!measurement.childScreenDelta ||
              Math.abs(measurement.childScreenDelta.x - 220) > 1 ||
              Math.abs(measurement.childScreenDelta.y - 40) > 1)
          )
            failure = "实际子元素没有跟随画框移动";
          if (
            action === "drag" &&
            preselect &&
            !inputControl &&
            measurement.selectedAfterGesture.join() !== "frame"
          )
            failure = "整框松手后丢失原选区";
          if (
            action === "drag" &&
            (cadence || rafInput) &&
            !inputControl &&
            measurement.senderMatchedPositions !== measurement.displayed
          )
            failure = "显示位置未能关联实际发送输入";
          if (
            action === "drag" &&
            (measurement.childMismatchFrames ||
              measurement.surfaceAfterGesture ||
              measurement.pendingAtEnd)
          )
            failure = "子元素屏幕位移不一致或松手后仍拦截画布命中";
          if ((action === "child" || action === "exit") && Math.abs(outcome.childDx) < 100)
            failure = "子元素没有实际移动";
          if (action === "entry" && Math.abs(outcome.outsideDx) < 150)
            failure = "待拖入元素未实际移动";
          if (action === "resize" && frame.width <= before[0].width) failure = "画框没有实际缩放";
          if (action === "create" && !after.some(node => node.type === "frame"))
            failure = "画框没有创建";
          if (action === "create" && dense && outcome.createdFrameChildren !== size)
            failure = "密集场景未完整收纳全部元素";
          if (verify && !inputControl && action !== "pan" && action !== "zoom" && !failure) {
            const committed = await page.evaluate(() =>
              JSON.stringify(window.frameBench.model.read())
            );
            if (options.seedGeometryBytes || options.reuseBoard) {
              outcome.historyAudit = [];
              for (const [direction, expected] of [
                ["undo", baseline],
                ["redo", committed],
              ]) {
                const result = await page.evaluate(
                  dir => window.frameBench.auditHistory(dir),
                  direction
                );
                outcome.historyAudit.push(result);
                if (!result.accepted) {
                  failure =
                    result.bytesUnchanged && result.modelUnchanged && result.stacksUnchanged
                      ? `历史操作 ${direction} 被拒绝且零写入：${result.error}`
                      : `历史操作 ${direction} 被拒绝后状态发生变化`;
                  break;
                }
                await page.evaluate(() => window.frameBench.verify());
                const matched =
                  (await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) ===
                  expected;
                outcome[direction === "undo" ? "undoRestored" : "redoRestored"] = matched;
                if (!matched) {
                  failure = "整次操作的撤销或重做不完整";
                  break;
                }
              }
            } else {
              await page.evaluate(() => window.frameBench.binding.undo());
              await page.evaluate(() => window.frameBench.verify());
              outcome.undoRestored =
                (await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) ===
                baseline;
              if (outcome.undoRestored) {
                await page.evaluate(() => window.frameBench.binding.redo());
                await page.evaluate(() => window.frameBench.verify());
                outcome.redoRestored =
                  (await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) ===
                  committed;
              }
              if (!outcome.undoRestored || !outcome.redoRestored)
                failure = "整次操作的撤销或重做不完整";
            }
          }
          const row = {
            action,
            size,
            mode,
            rate,
            round,
            variant,
            renderer,
            reusedBoard: !!options.reuseBoard,
            warmup: round < warmup,
            labels,
            dense,
            preselect,
            steps,
            rafInput,
            cadence,
            inputControl,
            browser: browser.product,
            taskMs,
            initialReadyMs,
            hotFunctions,
            releaseFunctions,
            rebaseFunctions,
            dispatches,
            timeline,
            ...measurement,
            outcome,
            failure: failure ?? fpsFailure,
            functionalFailure: failure,
            fpsFailure,
            errors: errors.splice(0),
          };
          if (hostStart)
            row.hostCpu = await page.evaluate(async start => {
              const response = await fetch(
                "/__frame-worker-progress?phase=sample-complete&start=" + start
              );
              return response.json();
            }, hostStart);
          if (options.reuseBoard || seeded) {
            row.seeded = seeded;
            row.capacity = await page.evaluate(() => {
              const f = window.frameBench;
              return {
                bytes: f.stateBytes(),
                x: f.api.getElement("frame")?.x,
                undo: f.binding.history.undoStack.length,
                redo: f.binding.history.redoStack.length,
                activeGesture: f.binding.gesture,
              };
            });
          }
          if (seeded && failure && !outcome.historyAudit && row.capacity.undo > 0) {
            outcome.rollbackAudit = await page.evaluate(() =>
              window.frameBench.auditHistory("undo")
            );
            await page.evaluate(() => window.frameBench.verify());
          }
          results.push(row);
          if (options.reuseBoard) {
            if (
              row.functionalFailure ||
              row.errors.length ||
              !outcome.redoRestored ||
              !outcome.undoRestored
            )
              throw new Error(
                "同板手势验证失败，保留现场：" +
                  JSON.stringify({
                    variant,
                    round,
                    failure: row.functionalFailure,
                    errors: row.errors,
                    capacity: row.capacity,
                    outcome,
                  })
              );
            await page.evaluate(() => window.frameBench.binding.undo());
            await page.evaluate(() => window.frameBench.verify());
            if (
              (await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) !==
              baseline
            )
              throw new Error("下一次同板输入前未恢复原始模型");
          }
          if (action === "drag" && options.dragVariants)
            await page.evaluate(
              summary =>
                fetch("/__frame-worker-progress?" + new URLSearchParams(summary)).then(
                  () => undefined
                ),
              {
                phase: "drag-result",
                variant,
                rate: String(rate),
                round: String(round),
                duration: String(Math.round(measurement.inputDurationMs)),
                maxMotion: String(measurement.maxMotionMs),
                release: String(measurement.releaseMs),
                qualified: String(row.hostCpu?.qualified),
                functional: String(!failure),
              }
            );
          console.log(JSON.stringify(row));
        }
    }
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  }
  return results;
}

const root = fileURLToPath(new URL("../e2e/whiteboard-frame/", import.meta.url));
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const sourceRef = process.argv.find(arg => arg.startsWith("--source-ref="))?.slice(13);
const sourceFiles = process.argv
  .find(arg => arg.startsWith("--source-files="))
  ?.slice(15)
  .split(",");
if (sourceFiles && !sourceRef) throw new Error("指定基线文件时需要提供 source-ref");
const sourceOverrides = new Map();
let sourceCommit;
const sourcePaths = new Set();
if (sourceRef) {
  sourceCommit = execFileSync("git", ["rev-parse", "--verify", `${sourceRef}^{commit}`], {
    cwd: repository,
    encoding: "utf8",
  }).trim();
  const paths = execFileSync(
    "git",
    [
      "ls-tree",
      "-r",
      "--name-only",
      sourceCommit,
      "--",
      "packages/whiteboard/src",
      "packages/collaboration/src",
    ],
    { cwd: repository, encoding: "utf8" }
  ).trim();
  for (const path of paths ? paths.split("\n") : [])
    if (!sourceFiles || sourceFiles.includes(path)) sourcePaths.add(join(repository, path));
}
const outDir = await mkdtemp(join(tmpdir(), "tau-frame-bench-"));
const cli = process.env.PLAYWRIGHT_CLI ?? "npx";
const session = `frame-bench-${process.pid}`;
const dragCompare = process.argv.some(arg => arg.startsWith("--drag-variants="));
const flatRenderer = process.argv.includes("--flat-renderer");
const rendererCompare = process.argv.includes("--renderer-compare");
const quietHost = process.argv.includes("--quiet-host");
const cpuTotals = () =>
  cpus().reduce(
    (sum, cpu) => ({
      idle: sum.idle + cpu.times.idle,
      total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    }),
    { idle: 0, total: 0 }
  );
let previousCpu = cpuTotals();
const hostCpu = [];
const sampleCpu = () => {
  const current = cpuTotals(),
    total = current.total - previousCpu.total;
  if (total > 0)
    hostCpu.push({
      at: Date.now(),
      utilization: 1 - (current.idle - previousCpu.idle) / total,
      load: loadavg(),
    });
  previousCpu = current;
};
const cpuTimer = quietHost ? setInterval(sampleCpu, 1000) : undefined;
let stoppingCpuWait = false;
const waitForQuietHost = async () => {
  let quiet = 0;
  while (quiet < 2 && !stoppingCpuWait) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    quiet = (hostCpu.at(-1)?.utilization ?? 1) < 0.4 ? quiet + 1 : 0;
  }
  return Date.now();
};
function run(args) {
  return new Promise((resolve, reject) => {
    const prefix = process.env.PLAYWRIGHT_CLI
      ? []
      : ["--yes", "--package", "@playwright/cli", "playwright-cli"];
    const child = spawn(cli, [...prefix, `-s=${session}`, ...args], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.on("data", chunk => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", code =>
      code ? reject(new Error(`Playwright CLI: ${code}`)) : resolve(output)
    );
  });
}
let server;
try {
  const config = {
    root,
    configFile: false,
    plugins: [
      {
        name: "frame-benchmark-source",
        enforce: "pre",
        configurePreviewServer(server) {
          server.middlewares.use(async (request, response, next) => {
            if (!request.url?.startsWith("/__frame-worker-progress?")) return next();
            console.log("WORKER_STRESS", request.url);
            const params = new URL(request.url, "http://127.0.0.1").searchParams;
            if (quietHost && params.get("phase") === "before-sample") {
              const start = await waitForQuietHost();
              response.setHeader("content-type", "application/json");
              response.end(JSON.stringify({ start }));
              return;
            }
            if (quietHost && params.get("phase") === "sample-complete") {
              sampleCpu();
              const samples = hostCpu.filter(sample => sample.at >= Number(params.get("start")));
              const maxCpu = Math.max(0, ...samples.map(sample => sample.utilization));
              response.setHeader("content-type", "application/json");
              response.end(
                JSON.stringify({ qualified: samples.length > 0 && maxCpu < 0.65, maxCpu, samples })
              );
              return;
            }
            response.statusCode = 204;
            response.end();
          });
        },
        async load(id) {
          const path = id.split("?")[0];
          if (process.argv.includes("--reuse-board") && path === join(root, "scene.tsx")) {
            const source = await readFile(path, "utf8");
            const marker =
              "Object.assign(fixture, { dragProbe: installDragProbe(binding, variant) });";
            if (!source.includes(marker)) throw new Error("同板比较的原型入口已变化");
            return source.replace(marker, "void 0;");
          }
          if (dragCompare) {
            const active =
              '(new URLSearchParams(location.search).get("drag-variant") ?? import.meta.env.VITE_FRAME_BENCH_DRAG_VARIANT ?? "baseline")';
            if (path === join(repository, "packages/whiteboard/src/collaboration/gesture.ts")) {
              const source = await readFile(path, "utf8");
              const gate = "binding.board?.framePresentation.isGeometryLimited() === true";
              const sample = "const measure =";
              if (!source.includes(gate) || !source.includes(sample))
                throw new Error("拖动几何对照未进入构建");
              return (
                (process.argv.includes("--reuse-board")
                  ? `let benchmarkDragVariant = ${active}; globalThis.setBenchGeometryVariant = value => { benchmarkDragVariant = value; };\n`
                  : `const benchmarkDragVariant = ${active};\n`) +
                source
                  .replace(
                    gate,
                    `(benchmarkDragVariant.includes("history-") || (benchmarkDragVariant === "budget-scope" && ${gate}))`
                  )
                  .replace(sample, sample + ' benchmarkDragVariant === "budget-scope" &&')
              );
            }
            if (path === join(repository, "packages/collaboration/src/node-tree-history.ts")) {
              const source = await readFile(path, "utf8");
              const marker = "const fresh = this.inScope(tx, reuse ? delta : source);";
              if (!source.includes(marker)) throw new Error("撤销区间计数对照未进入构建");
              return source.replace(
                marker,
                marker +
                  `
                const stats = globalThis.frameBench?.dragProbe?.history;
                if (stats) {
                  if (reuse) stats.reused++;
                  for (const ranges of source.clients.values()) for (const r of ranges) stats.totalClocks += r.len;
                  for (const ranges of (reuse ? delta : source).clients.values()) for (const r of ranges) stats.checkedClocks += r.len;
                }`
              );
            }
            if (path === join(repository, "packages/whiteboard/src/components/SelectionScope.tsx"))
              return (
                (await readFile(path, "utf8")).replace(
                  "export function SelectionScope(",
                  "function StableSelectionScope("
                ) +
                `\nexport const SelectionScope = ${active}.includes("scope") ? StableSelectionScope : SelectionContext.Provider;`
              );
            if (path === join(repository, "packages/whiteboard/src/hooks/useSelection.ts"))
              return (
                (await readFile(path, "utf8")).replace(
                  "export function useSelection(",
                  "function useStoreSelection("
                ) +
                `\nexport const useSelection = ${active}.includes("scope") ? useStoreSelection : function useOriginalSelection() { return useContext(SelectionContext); };`
              );
          }
          if (
            process.argv.some(arg => arg.startsWith("--drag-variants=")) &&
            path === join(repository, "packages/whiteboard/src/components/Geometry/index.tsx")
          ) {
            const source = await readFile(path, "utf8");
            if (!source.includes("<Editor\n")) throw new Error("图形标签编辑器对照未进入构建");
            return source
              .replace(
                "registerGeometryRenderers();",
                `registerGeometryRenderers();
              const GeometryLabelEditor = (new URLSearchParams(location.search).get("drag-variant") ??
                import.meta.env.VITE_FRAME_BENCH_DRAG_VARIANT ?? "").includes("label") ? memo(Editor) : Editor;`
              )
              .replace("<Editor\n", "<GeometryLabelEditor\n");
          }
          if (
            (dragCompare || flatRenderer || rendererCompare) &&
            path ===
              join(repository, "packages/whiteboard/src/components/BoardContent/ElementLayer.tsx")
          ) {
            let source = await readFile(path, "utf8");
            if (dragCompare) {
              const marker = "useLayoutEffect(() => () => containers.suspend(), [containers]);";
              if (!source.includes(marker)) throw new Error("画框宿主顺序对照未进入构建");
              const original = process.argv.includes("--stable-frame-hosts")
                ? '(new URLSearchParams(location.search).get("drag-variant") ?? import.meta.env.VITE_FRAME_BENCH_DRAG_VARIANT) === "baseline"'
                : "true";
              source = source.replace(
                marker,
                marker + `\n  if (${original}) return <g ref={root}>{nodes}</g>;`
              );
            }
            if (flatRenderer || rendererCompare) {
              const marker = "new ElementContainers()";
              if (!source.includes(marker)) throw new Error("逐元素对照未进入构建");
              const prototype = "new BatchElementContainers(board.framePresentation)";
              const factory = rendererCompare
                ? `new URLSearchParams(location.search).has("flat-frames") ? ${prototype} : ${marker}`
                : prototype;
              source =
                `import { BatchElementContainers } from "${join(root, "prototype/BatchElementContainers.ts")}";\n` +
                source.replace(marker, factory);
            }
            return source;
          }
          if (!sourcePaths.has(path)) return;
          if (!sourceOverrides.has(path))
            sourceOverrides.set(
              path,
              execFileSync("git", ["show", `${sourceCommit}:${path.slice(repository.length)}`], {
                cwd: repository,
                encoding: "utf8",
              })
            );
          return sourceOverrides.get(path);
        },
      },
      react(),
      tailwind(),
    ],
    logLevel: "error",
    build: {
      outDir,
      target: "esnext",
      ...(process.argv.includes("--readable-profile") ? { minify: false } : {}),
    },
    resolve: { dedupe: ["react", "react-dom", "react-dnd", "slate", "slate-react", "yjs"] },
  };
  await build(config);
  if (
    sourceCommit &&
    !(
      sourceFiles ?? [
        "packages/collaboration/src/whiteboard-model.ts",
        "packages/whiteboard/src/Board.tsx",
        "packages/whiteboard/src/components/CreationPreview/index.tsx",
      ]
    ).every(path => sourceOverrides.has(join(repository, path)))
  )
    throw new Error("基线源码未进入基准构建");
  server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
  await run(["open", "about:blank"]);
  if (
    process.argv.includes("--stress") ||
    process.argv.includes("--stress-structure") ||
    process.argv.includes("--stress-fragmented") ||
    process.argv.includes("--stress-retained") ||
    process.argv.includes("--stress-drag-conflicts")
  ) {
    const structure = process.argv.includes("--stress-structure");
    const conflictsOnly = process.argv.includes("--stress-drag-conflicts");
    const retained =
      conflictsOnly ||
      process.argv.includes("--stress-retained") ||
      process.argv.includes("--stress-fragmented");
    const target = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
    if (target) await writeFile(target, JSON.stringify({ status: "running" }) + "\n");
    try {
      const output = await run([
        "run-code",
        `async page => {
          try { return await (${(retained ? stressFrameRetained : structure ? stressFrameStructure : stressFrame).toString()})(page, ${JSON.stringify(server.resolvedUrls.local[0])}, ${conflictsOnly ? 0 : structure || retained ? 5 : 20}, ${Number(process.argv.find(arg => arg.startsWith("--stress-rate="))?.slice(14) ?? 1)}, ${process.argv.includes("--stress-fragmented")}, ${conflictsOnly}); }
          catch (error) { return { status: "failed", error: error.message }; }
        }`,
      ]);
      const match = output.match(/### Result\n([^\n]+)/);
      if (!match) throw new Error("压力场景未返回结果");
      const result = JSON.parse(match[1]);
      if (target) await writeFile(target, JSON.stringify(result, null, 2) + "\n");
      if (result.status === "failed") throw new Error(result.error);
    } catch (error) {
      if (target)
        await writeFile(target, JSON.stringify({ status: "failed", error: error.message }) + "\n");
      throw error;
    }
  } else {
    const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7) ?? null;
    const target = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
    const cases = process.argv.includes("--quick")
      ? [["drag", 100, "frame", 1]]
      : [
          ["drag", 100, "frame", 1],
          ["drag", 255, "frame", 1],
          ["drag", 256, "frame", 1],
          ["drag", 500, "frame", 1],
          ["drag", 1000, "frame", 1],
          ["drag", 1000, "frame", 4],
          ["child", 1000, "frame", 1],
          ["child", 1000, "loose", 1],
          ["child", 1000, "many", 1],
          ["pan", 1000, "frame", 1],
          ["zoom", 1000, "frame", 1],
          ["resize", 1000, "frame", 1],
          ["create", 1000, "create", 1],
          ["create", 0, "create", 1],
          ["create", 1, "create", 1],
          ["entry", 1, "entry", 1],
          ["entry", 1, "column", 1],
          ["entry", 1, "mind", 1],
          ["create", 1, "column", 1],
          ["create", 1, "mind", 1],
          ["exit", 1000, "frame", 1],
          ["fit", 1000, "frame", 1],
          ["dissolve", 1000, "frame", 1],
        ];

    const rates = process.argv
      .find(arg => arg.startsWith("--rates="))
      ?.slice(8)
      .split(",")
      .map(Number);
    const selectedCases = rates
      ? [
          ...new Map(
            cases
              .flatMap(([action, size, mode]) => rates.map(rate => [action, size, mode, rate]))
              .map(row => [JSON.stringify(row), row])
          ).values(),
        ]
      : cases;
    const results = [];
    for (const scenario of selectedCases) {
      const [action, size, mode, rate] = scenario;
      const key = `${action}:${mode}:${size}:${rate}`;
      if (only && !only.split(",").some(value => key === value || key.startsWith(value + ":")))
        continue;
      const rounds = process.argv.includes("--quick")
        ? 1
        : Number(process.argv.find(arg => arg.startsWith("--rounds="))?.slice(9) ?? 4);
      const options = {
        verify: process.argv.includes("--verify"),
        profile: process.argv.includes("--profile"),
        dragVariants: process.argv
          .find(arg => arg.startsWith("--drag-variants="))
          ?.slice(16)
          .split(","),
        cadence: process.argv.includes("--cadence"),
        alignCadence: process.argv.includes("--align-cadence"),
        observeSurface: process.argv.includes("--observe-hit-surface"),
        reuseBoard: process.argv.includes("--reuse-board"),
        seedGeometryBytes: Number(
          process.argv.find(arg => arg.startsWith("--seed-geometry-bytes="))?.split("=")[1] ?? 0
        ),
        labels: process.argv.includes("--labels"),
        rafInput: process.argv.includes("--raf-input"),
        steps: Number(process.argv.find(arg => arg.startsWith("--steps="))?.slice(8) ?? 48),
        settleMs: Number(process.argv.find(arg => arg.startsWith("--settle-ms="))?.slice(12) ?? 0),
        preselect: process.argv.includes("--preselect"),
        assertFps: process.argv.includes("--assert-60fps"),
        warmup: Number(process.argv.find(arg => arg.startsWith("--warmup="))?.slice(9) ?? 0),
        dense: process.argv.includes("--dense"),
        trace: process.argv.includes("--trace"),
        inputControl: process.argv.includes("--input-control"),
        quietHost,
        renderers: rendererCompare
          ? ["individual", "flat"]
          : [flatRenderer ? "flat" : "individual"],
      };
      const hostLoadBefore = loadavg();
      const output = await run([
        "run-code",
        `async page => {
      try { return await (${sample.toString()})(page, ${JSON.stringify(server.resolvedUrls.local[0])}, ${JSON.stringify([scenario])}, ${rounds}, ${JSON.stringify(options)}); }
      catch (error) { return [...(page.frameResults ?? []), { scenario: ${JSON.stringify(scenario)}, failure: error.message }]; }
      finally { page.removeAllListeners("pageerror"); page.removeAllListeners("console"); }
    }`,
      ]);
      const match = output.match(/### Result\n([^\n]+)/);
      if (!match) throw new Error("Playwright 未返回采样结果");
      results.push(
        ...JSON.parse(match[1]).map(row => ({
          ...row,
          batchMoves: row.renderer?.startsWith("flat") ?? false,
          flatFrames: row.renderer?.startsWith("flat") ?? false,
          sourceRef: sourceCommit ?? null,
          sourceFiles: sourceOverrides.size,
          sourceScope: sourceFiles ?? null,
          host: { cpuCount: cpus().length, loadBefore: hostLoadBefore, loadAfter: loadavg() },
        }))
      );
      if (target) await writeFile(target, JSON.stringify(results, null, 2) + "\n");
      console.log("COMPLETED", key);
    }
    if (
      process.argv.includes("--verify") &&
      results.some(
        row =>
          row.errors?.length ||
          (row.failure && !(row.warmup && row.fpsFailure && !row.functionalFailure))
      )
    )
      throw new Error("画框验收未通过，详见采样结果");
  }
} finally {
  stoppingCpuWait = true;
  if (cpuTimer) clearInterval(cpuTimer);
  await run(["close"]).catch(error => console.error("关闭基准浏览器失败", error));
  await server?.close();
  await rm(outDir, { recursive: true, force: true });
}
