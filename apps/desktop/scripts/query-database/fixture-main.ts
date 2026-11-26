import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import PathUtil from "../../src-electron/main/utils/PathUtil";
import { configureWindowContext } from "../../src-electron/main/windows/context";

const copy = process.env.TAU_QUERY_STRESS_COPY;
const scratch = process.env.TAU_QUERY_STRESS_RUN;
const desktop = process.env.TAU_QUERY_DESKTOP_ROOT;
if (!copy || !scratch || !desktop) throw new Error("缺少隔离测试目录");
mkdirSync(join(scratch, "profile"), { recursive: true });
app.setPath("userData", join(scratch, "profile"));
PathUtil.getAppDir = () => copy;
configureWindowContext({
  devServerUrl: "",
  rendererDist: join(desktop, "dist"),
  preload: join(desktop, "dist-electron/preload/index.js"),
});
app.on("window-all-closed", () => undefined);

app.whenReady().then(async () => {
  try {
    const { setupFixture } = await import("./fixture-backend");
    await setupFixture(copy);
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        preload: join(desktop, "dist-electron/preload/index.js"),
        additionalArguments: ["--tau-window-role=main"],
      },
    });
    const crashes: string[] = [];
    const observed = new Map<number, { type: string; workingSetKB: number }>();
    let maxLiveTabs = 0;
    let maxAggregateWorkingSetKB = 0;
    const memoryTimer = setInterval(() => {
      const metrics = app.getAppMetrics();
      maxLiveTabs = Math.max(maxLiveTabs, metrics.filter(metric => metric.type === "Tab").length);
      maxAggregateWorkingSetKB = Math.max(
        maxAggregateWorkingSetKB,
        metrics.reduce((sum, metric) => sum + metric.memory.workingSetSize, 0)
      );
      for (const metric of metrics) {
        const workingSetKB = metric.memory.workingSetSize;
        const previous = observed.get(metric.pid);
        if (!previous || workingSetKB > previous.workingSetKB)
          observed.set(metric.pid, { type: metric.type, workingSetKB });
      }
    }, 200);
    window.webContents.on("render-process-gone", (_, details) => crashes.push(details.reason));
    window.webContents.on("console-message", ({ message }) => {
      if (message.startsWith("QUERY_CASE:")) console.log(message);
    });
    await window.loadFile(join(scratch, "renderer/index.html"));
    const result = await window.webContents.executeJavaScript("window.verifyQueryDataStress()");
    await new Promise(resolve => setTimeout(resolve, 500));
    clearInterval(memoryTimer);
    console.log(
      "QUERY_STRESS:" +
        JSON.stringify({
          ...result,
          crashes,
          maxLiveTabs,
          maxAggregateWorkingSetKB,
          finalLiveTabs: app.getAppMetrics().filter(metric => metric.type === "Tab").length,
          observedMemoryByType: Object.fromEntries(
            [...new Set([...observed.values()].map(value => value.type))].map(type => [
              type,
              Math.max(
                ...[...observed.values()]
                  .filter(value => value.type === type)
                  .map(value => value.workingSetKB)
              ),
            ])
          ),
        })
    );
    window.destroy();
    app.exit(result.failed || crashes.length ? 1 : 0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
setTimeout(() => app.exit(2), 300_000).unref();
