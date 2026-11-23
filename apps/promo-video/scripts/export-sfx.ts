// 回放片的音效：从回放时间轴导出事件表，再由 scripts/sfx/sfx.py 合成成 public/sfx/<片名>.mp3
// 用法（在 apps/promo-video 下）：pnpm sfx tutorial | video-notes；改了章节脚本要重跑，否则声音和画面对不上
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import type { Sfx } from "../src/kit/replay.ts";

const films: Record<string, () => Promise<{ events: Sfx[]; file: string }>> = {
  tutorial: () => import("../src/films/tutorial/timeline.ts").then(m => ({ events: m.TIMELINE.chapters.flatMap(chapter => chapter.run.sfx), file: "tutorial-syntax" })),
  "video-notes": () =>
    Promise.all([import("../src/films/feature-films/shared/timeline.ts"), import("../src/films/feature-films/video-notes/script.ts")]).then(([timeline, script]) => ({
      events: timeline.sfxEvents(timeline.layout(script.CHAPTERS)),
      file: "video-notes",
    })),
};

const name = process.argv[2];
if (!name || !(name in films)) {
  console.error(`用法：pnpm sfx <${Object.keys(films).join(" | ")}>`);
  process.exit(1);
}
const { events, file } = await films[name]();
const table = events.map(event => ({ t: +(event.t / 60).toFixed(3), kind: event.kind }));
mkdirSync("out/music", { recursive: true });
mkdirSync("public/sfx", { recursive: true });
writeFileSync(`out/music/${file}-sfx.json`, JSON.stringify(table));
console.log(`${table.length} 个音效事件`);
execFileSync("uv", ["run", "--quiet", "scripts/sfx/sfx.py", `out/music/${file}-sfx.json`, `out/music/${file}-sfx.wav`, "--mp3"], { stdio: "inherit" });
copyFileSync(`out/music/${file}-sfx.mp3`, `public/sfx/${file}.mp3`);
console.log(`→ public/sfx/${file}.mp3`);
