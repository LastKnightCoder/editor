// 教程片音效：从按键重放的时间轴导出事件表，再由 scripts/sfx/sfx.py 合成成 public/sfx/tutorial-syntax.mp3
// 用法（在 apps/promo-video 下）：pnpm tutorial:sfx；改了章节脚本要重跑，否则声音和画面对不上
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { FPS, TIMELINE } from "../src/films/tutorial/timeline.ts";

const events = TIMELINE.chapters.flatMap(c => c.run.sfx).map(e => ({ t: +(e.t / FPS).toFixed(3), kind: e.kind }));
mkdirSync("out/music", { recursive: true });
mkdirSync("public/sfx", { recursive: true });
writeFileSync("out/music/tutorial-sfx.json", JSON.stringify(events));
console.log(`${events.length} 个音效事件`);
execFileSync("uv", ["run", "--quiet", "scripts/sfx/sfx.py", "out/music/tutorial-sfx.json", "out/music/tutorial-sfx.wav", "--mp3"], { stdio: "inherit" });
copyFileSync("out/music/tutorial-sfx.mp3", "public/sfx/tutorial-syntax.mp3");
console.log("→ public/sfx/tutorial-syntax.mp3");
