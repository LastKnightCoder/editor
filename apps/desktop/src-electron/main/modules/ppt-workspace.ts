import { BrowserWindow, ipcMain, type WebContents } from "electron";
import log from "electron-log";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

interface Workspace {
  owner: WebContents;
  root: string;
  names: Set<string>;
  close: () => void;
}
const workspaces = new Map<string, Workspace>();
const draftPath =
  /^draft\/(?:deck\.json|original-shell\.html|overrides\.css|slides\/[a-z][a-z0-9_-]{0,63}\.html|assets\/[a-z][a-z0-9_-]*\.image)$/;
const templatePath =
  /^template\/(?:layouts\.md|style\.md|theme\.css|shell\.html|decoration\.js|examples\/[a-z0-9-]+\.html)$/;

async function putFile(root: string, name: string, source: string) {
  const path = join(root, name);
  if ((await realpath(dirname(path))) !== dirname(path)) throw new Error("工作目录路径已变化");
  const temporary = join(dirname(path), randomUUID());
  try {
    await writeFile(temporary, source, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

// 在独立分区冷开磁盘文件，断开网络并遍历真实运行时的前进和后退。
async function verifyPlayback(
  path: string,
  ids: string[],
  mode: "original" | "roundtrip" | "publish" = "publish"
) {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      partition: `ppt-check-${randomUUID()}`,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  const wc = win.webContents;
  const url = pathToFileURL(path).href;
  let failure = "";
  wc.session.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
  wc.session.webRequest.onBeforeRequest((details, reply) => {
    const allowed = details.url === url || details.url.startsWith("data:");
    if (!allowed) failure = "成稿引用外部资源";
    reply({ cancel: !allowed });
  });
  wc.on("will-navigate", event => event.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("console-message", details => {
    if (details.level === "error") failure = details.message;
  });
  const timeout = setTimeout(
    () => {
      failure = "演示文件播放检查超时";
      win.destroy();
    },
    15000 + ids.length * 1100
  );
  try {
    await win.loadFile(path);
    const comparison: string = await wc.executeJavaScript(`(async () => {
      const ids = ${JSON.stringify(ids)};
      const slides = [...document.querySelectorAll(".slide")];
      const countersMatch = (selector, n, attribute) => [...document.querySelectorAll(selector)].every(el => {
        const format = el.getAttribute(attribute);
        const text = el.textContent.trim();
        if (format === "roman" || format === "cjk") return text.length > 0;
        return text === (format === "pad2" ? String(n).padStart(2,"0") : String(n));
      });
      const check = (i) => {
        const active = document.querySelectorAll(".slide.active");
        if (active.length !== 1 || active[0] !== slides[i] ||
            (${mode !== "original"} && slides[i].dataset.slideId !== ids[i]) || slides[i].getAttribute("aria-current") !== "page" ||
            getComputedStyle(slides[i]).display === "none" || !countersMatch("[data-deck-current]",i+1,"data-deck-current"))
          throw Error("第 "+(i+1)+" 页无法播放");
      };
      if (slides.length !== ids.length || window.deck?.total !== ids.length || !countersMatch("[data-deck-total]",ids.length,"data-deck-total"))
        throw Error("清单与播放页数不符");
      for (const image of document.images) {
        try { await image.decode(); } catch { throw Error(image.closest(".slide")?.dataset.slideId + " 的图片无法解码"); }
      }
      await new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const hasInk = canvas => {
        if (!canvas.width || !canvas.height) return false;
        const probe = document.createElement("canvas");
        probe.width = 96; probe.height = 96;
        const ctx = probe.getContext("2d");
        ctx.drawImage(canvas,0,0,96,96);
        return ctx.getImageData(0,0,96,96).data.some((v,i)=>i%4===3 && v>0);
      };
      const painted = slides.map(slide=>Array.from(slide.querySelectorAll("canvas")).some(hasInk));
      if (document.querySelector("script[data-ppt-decoration]") && !painted.some(Boolean))
        throw Error("手绘稿缺少可播放的装饰画布，请沿用模板的 canvas 或 title-underline");
      const comparison = ${mode !== "publish"} ? JSON.stringify(slides.map(slide => {
        const clone=slide.cloneNode(true);
        clone.removeAttribute("data-slide-id");
        for (const counter of clone.querySelectorAll("[data-count]")) counter.textContent=counter.dataset.count;
        for (const bar of clone.querySelectorAll("[data-percent]")) bar.style.width=bar.dataset.percent+"%";
        const style=getComputedStyle(slide);
        return [clone.outerHTML, style.display, style.color, style.backgroundColor, style.fontFamily];
      })) : "";
      check(0);
      document.dispatchEvent(new KeyboardEvent("keydown",{key:"o",bubbles:true}));
      const cards = [...document.querySelectorAll(".ov-grid .ov-card")];
      if (cards.length !== ids.length || cards.some((card,i)=>painted[i] && !Array.from(card.querySelectorAll("canvas")).some(hasInk)))
        throw Error("全览缩略页不完整");
      document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
      if (document.querySelector(".ov-grid")) throw Error("无法退出全览");
      const move = async (key,i) => {
        document.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true}));
        await new Promise(resolve => setTimeout(resolve, (Number(document.body.dataset.deckLock) || 600)+60));
        check(i);
      };
      for (let i=1;i<slides.length;i++) await move("ArrowRight",i);
      if (slides.length>1) await move("ArrowLeft",slides.length-2);
      return comparison;
    })()`);
    if (failure) throw new Error(failure);
    return comparison && createHash("sha256").update(comparison).digest("hex");
  } catch (error) {
    throw failure ? new Error(failure) : error;
  } finally {
    clearTimeout(timeout);
    if (!win.isDestroyed()) win.destroy();
  }
}

export function ownsPPTDraft(sender: Pick<WebContents, "isDestroyed">, cwd: string) {
  return [...workspaces.values()].some(ws => ws.owner === sender && cwd === join(ws.root, "draft"));
}

export function registerPPTWorkspace() {
  ipcMain.handle("ppt-workspace:open", async ({ sender }, files: Record<string, string>) => {
    const id = randomUUID();
    const root = await realpath(await mkdtemp(join(tmpdir(), "tau-ppt-")));
    const close = () => {
      workspaces.delete(id);
      sender.removeListener("destroyed", close);
      void rm(root, { force: true, recursive: true }).catch(error =>
        log.warn("[ppt] 清理草稿失败", error)
      );
    };
    try {
      for (const dir of ["template/examples", "draft/slides", "draft/assets", "build"])
        await mkdir(join(root, dir), { recursive: true });
      for (const [name, source] of Object.entries(files)) {
        if (!draftPath.test(name) && !templatePath.test(name)) throw new Error("无效的草稿文件名");
        await putFile(root, name, source);
      }
      if (sender.isDestroyed()) throw new Error("窗口已关闭");
      workspaces.set(id, { owner: sender, root, names: new Set(Object.keys(files)), close });
      sender.once("destroyed", close);
      return { id, cwd: join(root, "draft") };
    } catch (error) {
      close();
      throw error;
    }
  });
  ipcMain.handle(
    "ppt-workspace:file",
    async ({ sender }, id: string, action: string, name: string, value?: string) => {
      const ws = workspaces.get(id);
      if (!ws || ws.owner !== sender) throw new Error("演示文稿工作目录已关闭");
      if (action === "close") {
        ws.close();
        return;
      }
      if (action === "list") return [...ws.names].sort();
      const path = join(ws.root, name);
      if (action === "read" && ws.names.has(name) && (await realpath(path)) === path)
        return readFile(path, "utf8");
      if (name === "draft/original-shell.html" || !draftPath.test(name))
        throw new Error("只能修改当前草稿目录中的源文件");
      if (action === "write" && typeof value === "string") {
        await putFile(ws.root, name, value);
        ws.names.add(name);
      } else if (action === "remove" && ws.names.has(name)) {
        await rm(path);
        ws.names.delete(name);
      } else throw new Error("无法读取或修改此文件");
    }
  );
  ipcMain.handle(
    "ppt-workspace:verify",
    async (
      { sender },
      id: string,
      html: string,
      ids: string[],
      mode: "original" | "roundtrip" | "publish" = "publish"
    ) => {
      const ws = workspaces.get(id);
      if (!ws || ws.owner !== sender) throw new Error("演示文稿工作目录已关闭");
      await putFile(ws.root, "build/deck.html", html);
      const digest = await verifyPlayback(join(ws.root, "build/deck.html"), ids, mode);
      ws.names.add("build/deck.html");
      return digest;
    }
  );
}
