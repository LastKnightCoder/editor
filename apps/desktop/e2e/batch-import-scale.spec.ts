import { expect, test, type ElectronApplication } from "@playwright/test";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { ZipWriter, TextReader, configure } from "@zip.js/zip.js";
import { availablePort, createSandbox, disposeSandbox, launch } from "./content-production/harness";

const count = 22_000;
const note = (n: number) => "note-" + String(n).padStart(5, "0");
const digest = async (path: string) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};
async function fixture(dir: string, kind: string) {
  const vault = join(dir, "vault");
  await mkdir(join(vault, ".obsidian"), { recursive: true });
  const zipPath = join(dir, "vault.zip");
  configure({ useWebWorkers: false });
  const zip =
    kind === "zip" ? new ZipWriter(Writable.toWeb(createWriteStream(zipPath))) : undefined;
  await zip?.add(".obsidian/config", new TextReader("{}"));
  const body = "Markdown paragraph. ".repeat(410);
  for (let i = 0; i < count; i++) {
    const path = note(i) + ".md";
    let text = note(i) + "\n\n" + body;
    if (i % 100 === 0 || i === count - 1)
      text += "\n\n[[" + note(i === count - 1 ? 0 : count - 1) + "]]";
    if (i === 0 || i === count - 1) text += "\n\n![[shared.wav]]";
    if (zip) await zip.add(path, new TextReader(text));
    else await writeFile(join(vault, path), text);
  }
  const asset = join(vault, "shared.wav");
  await writeFile(asset, Buffer.alloc(64 * 1024 * 1024, 37));
  await zip?.add(
    "shared.wav",
    Readable.toWeb(createReadStream(asset)) as ReadableStream<Uint8Array>
  );
  await zip?.close();
  return { path: zip ? zipPath : vault, asset };
}

test.skip(!process.env.TAU_IMPORT_SCALE, "显式执行大库压测");
for (const kind of ["folder", "zip"])
  test(kind + " imports 22000 Obsidian notes", async () => {
    test.setTimeout(30 * 60_000);
    const dir = await createSandbox("tau-batch-scale-");
    let running: ElectronApplication | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      const input = await fixture(dir, kind);
      const { app, page } = await launch(dir, await availablePort(), value => {
        running = value;
      });
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, input.path);
      await page.getByTitle("搜索或跳转 (Ctrl+K)").click();
      await page.getByPlaceholder(/^搜索内容/).fill("批量导入");
      await page.getByText("批量导入文件夹 / 压缩包…", { exact: true }).click();
      const wizard = page.getByRole("dialog");
      const rendererPid = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find(w => w.isVisible())!
          .webContents.getOSProcessId()
      );
      const memory = () =>
        app.evaluate(({ app }, pid) => {
          const metrics = app.getAppMetrics();
          return [
            metrics.find(m => m.type === "Browser")!.memory.workingSetSize / 1024,
            metrics.find(m => m.pid === pid)!.memory.workingSetSize / 1024,
          ];
        }, rendererPid);
      let phase = "scan";
      const peaks: Record<string, number[]> = {};
      const baseline = await memory();
      const sample = async () => {
        const key = phase;
        const reading = await memory();
        peaks[key] = reading.map((value, i) => Math.max(value, peaks[key]?.[i] ?? 0));
      };
      timer = setInterval(() => void sample().catch(() => {}), 500);
      const start = Date.now();
      await wizard
        .getByRole("button", { name: kind === "zip" ? "压缩包" : "选择文件夹", exact: true })
        .click();
      await expect(wizard.getByText(/22000 个 Markdown/)).toBeVisible({ timeout: 600_000 });
      await wizard.getByRole("button", { name: /文章.*平铺/ }).click();
      const scanned = Date.now();
      phase = "preview";
      await wizard.getByRole("button", { name: "下一步" }).click();
      const mounted = await wizard.getByRole("treeitem").count();
      expect(mounted).toBeGreaterThan(0);
      expect(mounted).toBeLessThan(100);
      await sample();
      phase = "write";
      await wizard.getByRole("button", { name: "导入 22000 篇" }).click();
      await expect(wizard.getByText("已导入 22000 篇", { exact: true })).toBeVisible({
        timeout: 1200_000,
      });
      await expect(wizard.getByText(/1 个资源已入库 · 221 处链接/)).toBeVisible();
      await sample();
      const data = join(dir, "home/.editor");
      const sql = new DatabaseSync(join(data, "data.db"), { readOnly: true });
      try {
        expect(sql.prepare("SELECT count(*) AS n FROM articles").get()?.n).toBe(count);
        for (const [from, to] of [
          [0, count - 1],
          [count - 1, 0],
        ]) {
          const target = sql
            .prepare("SELECT id,content_id FROM articles WHERE title=?")
            .get(note(to));
          const source = sql
            .prepare(
              "SELECT c.content FROM articles a JOIN content_snapshots c ON c.id=a.content_id WHERE a.title=?"
            )
            .get(note(from));
          expect(String(source?.content)).toContain('"content-link"');
          expect(String(source?.content)).toContain('"refId":' + target!.id);
          expect(String(source?.content)).toContain('"contentId":' + target!.content_id);
        }
      } finally {
        sql.close();
      }
      const assets = await readdir(join(data, "resources"));
      const copies = assets.filter(name => name.endsWith(".wav"));
      expect(copies).toHaveLength(1);
      const copy = join(data, "resources", copies[0]);
      expect((await stat(copy)).size).toBe(64 * 1024 * 1024);
      expect(await digest(copy)).toBe(await digest(input.asset));
      console.log(
        "IMPORT_SCALE_RESULT",
        JSON.stringify({
          kind,
          count,
          scanSeconds: (scanned - start) / 1000,
          remainingSeconds: (Date.now() - scanned) / 1000,
          baseline,
          peaks,
          mounted,
        })
      );
    } finally {
      clearInterval(timer);
      await disposeSandbox(dir, running);
    }
  });
