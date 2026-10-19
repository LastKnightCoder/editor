// 曲内拍序号 → 产品片帧号：node scripts/beat-frames.mjs 296 328.5 …
// 与 src/films/product/timeline.ts 同一算法（beats 表之外按 BPM 外推，小数拍在相邻两拍间插值），自检选帧、段落渲染的 --frames 都用它。
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/brand/music.ts", import.meta.url), "utf8");
const track = source.slice(source.indexOf("motivationalTechnology"));
const beats = JSON.parse(track.match(/beats: (\[[^\]]+\])/)[1]);
const bpm = Number(track.match(/bpm: ([\d.]+)/)[1]);
const beatLen = 60 / bpm;
const wholeBeat = n => (n < beats.length ? beats[n] : beats[beats.length - 1] + (n - beats.length + 1) * beatLen);
const trackBeat = n => {
  const i = Math.floor(n);
  return wholeBeat(i) + (wholeBeat(i + 1) - wholeBeat(i)) * (n - i);
};
const offset = trackBeat(11 * 4);
const fps = 60;

const args = process.argv.slice(2).map(Number);
if (!args.length) {
  console.error("用法：node scripts/beat-frames.mjs <曲内拍序号…>（小节 n 的第 k 拍 = n * 4 + k）");
  process.exit(1);
}
for (const n of args) console.log(`拍 ${n}（第 ${Math.floor(n / 4)} 小节）→ 帧 ${Math.round((trackBeat(n) - offset) * fps)}`);
