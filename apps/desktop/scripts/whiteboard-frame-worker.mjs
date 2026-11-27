export async function sampleFrameWorker(page, url, options) {
  const errors = [],
    results = [];
  page.frameWorkerResults = results;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", event => {
    if (event.type() === "error" && !event.text().includes("404")) errors.push(event.text());
  });
  const cdp = await page.context().newCDPSession(page);
  const browser = await cdp.send("Browser.getVersion");
  await page.setViewportSize({ width: 1000, height: 700 });
  try {
    if (options.stress || options.chain) {
      for (const scene of ["dense", "mixed"]) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await page.goto(
          url +
            (scene === "dense"
              ? `?mode=${options.chain ? "frame" : "create"}&size=1000&labels&dense`
              : "?mode=nested&size=900&legacy&labels")
        );
        await page.waitForFunction(() => window.frameBench?.ready);
        await page.evaluate(async options => {
          window.frameWorker = await window.frameBench.startPrototype(
            true,
            options.handoff,
            options.incremental
          );
        }, options);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        const result = await page.evaluate(
          async options =>
            options.chain
              ? window.frameWorker.chain(options.cycles)
              : window.frameWorker.stress(options.cycles),
          options
        );
        results.push({ scene, rate: 4, ...result, errors: [...errors] });
      }
      if (errors.length) throw new Error(errors.join("\n"));
      return results;
    }
    for (const action of options.actions)
      for (const rate of options.rates)
        for (const mode of options.modes ?? ["sync", "worker"])
          for (let round = 0; round < options.rounds; round++)
            for (const renderer of options.renderers)
              for (let attempt = 1; attempt <= 4; attempt++) {
                await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
                await page.goto(
                  `${url}?mode=${action === "create" ? "create" : "frame"}&size=1000&labels${options.dense ? "&dense" : ""}${renderer === "flat" ? "&batch-moves&flat-frames" : ""}`
                );
                await page.waitForFunction(
                  () =>
                    window.frameBench?.ready &&
                    document.querySelector("svg[data-whiteboard-canvas]")
                );
                await page.evaluate(async mode => {
                  window.frameWorker = await window.frameBench.startPrototype(
                    mode !== "sync",
                    mode === "handoff" || mode === "incremental",
                    mode === "incremental"
                  );
                  await document.fonts.ready;
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  await new Promise(resolve =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                  );
                }, mode);
                await cdp.send("Emulation.setCPUThrottlingRate", { rate });
                const hostStart = options.quietHost
                  ? await page.evaluate(async () => {
                      const response = await fetch("/__frame-worker-progress?phase=before-sample");
                      return (await response.json()).start;
                    })
                  : undefined;
                if (options.profile) {
                  await cdp.send("Profiler.enable");
                  await cdp.send("Profiler.start");
                }
                if (options.trace)
                  await cdp.send("Tracing.start", {
                    categories: "devtools.timeline,blink.user_timing",
                    transferMode: "ReturnAsStream",
                  });
                const result = await page.evaluate(
                  async ({ action, mode }) => window.frameWorker.run(action, mode),
                  { action, mode }
                );
                let sampleStart = -Infinity,
                  sampleEnd = Infinity;
                if (options.trace) {
                  const finished = new Promise(resolve =>
                    cdp.once("Tracing.tracingComplete", resolve)
                  );
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
                  const start = events.find(event => event.name === "frame-sample-start");
                  const end = events.find(event => event.name === "frame-sample-end");
                  if (!start || !end) throw new Error("性能轨迹没有操作边界");
                  sampleStart = start.ts;
                  sampleEnd = end.ts;
                  const durations = new Map();
                  for (const event of events) {
                    if (
                      event.ph !== "X" ||
                      event.pid !== start.pid ||
                      event.tid !== start.tid ||
                      event.ts < sampleStart ||
                      event.ts >= sampleEnd
                    )
                      continue;
                    const entry = durations.get(event.name) ?? { count: 0, totalMs: 0, maxMs: 0 };
                    entry.count++;
                    const duration = (Math.min(sampleEnd, event.ts + event.dur) - event.ts) / 1000;
                    entry.totalMs += duration;
                    entry.maxMs = Math.max(entry.maxMs, duration);
                    durations.set(event.name, entry);
                  }
                  result.timeline = [...durations]
                    .map(([name, value]) => ({ name, ...value }))
                    .sort((a, b) => b.totalMs - a.totalMs);
                }
                if (options.profile) {
                  const { profile } = await cdp.send("Profiler.stop");
                  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
                  const times = new Map();
                  let at = profile.startTime;
                  profile.samples?.forEach((id, index) => {
                    at += profile.timeDeltas[index];
                    if (at >= sampleStart && at < sampleEnd)
                      times.set(id, (times.get(id) ?? 0) + profile.timeDeltas[index] / 1000);
                  });
                  result.hotFunctions = [...times]
                    .map(([id, ms]) => ({
                      ...nodes.get(id).callFrame,
                      ms: +ms.toFixed(1),
                    }))
                    .sort((a, b) => b.ms - a.ms)
                    .slice(0, 35);
                }
                results.push({
                  ...result,
                  renderer,
                  batchMoves: renderer === "flat",
                  flatFrames: renderer === "flat",
                  rate,
                  round,
                  warmup: round < options.warmup,
                  browser: browser.product,
                  errors: [...errors],
                });
                const hostCpu = await page.evaluate(
                  async data => {
                    const response = await fetch(
                      "/__frame-worker-progress?" +
                        new URLSearchParams({ phase: "sample-complete", ...data })
                    );
                    return response.headers.get("content-type")?.includes("application/json")
                      ? response.json()
                      : undefined;
                  },
                  {
                    action,
                    mode,
                    rate: String(rate),
                    round: String(round),
                    ...(hostStart ? { start: String(hostStart) } : {}),
                  }
                );
                Object.assign(results.at(-1), { attempt, ...(hostCpu ? { hostCpu } : {}) });
                if (hostCpu && !hostCpu.qualified) {
                  if (attempt >= 4)
                    throw new Error("同一采样连续受到并行负载影响，保留结果后停止验收");
                  continue;
                }
                break;
              }
    if (errors.length) throw new Error(errors.join("\n"));
    return results;
  } finally {
    await page
      .evaluate(() => window.frameWorker?.worker?.dispose())
      .catch(error => {
        if (!page.isClosed()) console.warn("清理画框原型失败", error.message);
      });
    await cdp.detach();
  }
}
