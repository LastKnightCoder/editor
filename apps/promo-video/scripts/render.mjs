// 用法：pnpm render <CompositionId> [输出文件]，默认输出 out/<id>.mp4，并导出同名 SRT
import { execFileSync } from "node:child_process";

const [id = "DayInLife", output = `out/${id}.mp4`] = process.argv.slice(2);
execFileSync("npx", ["remotion", "render", "src/index.ts", id, output, "--codec=h264", "--crf=16"], {
  stdio: "inherit",
});
execFileSync("node", ["--experimental-strip-types", "scripts/export-srt.ts", output.replace(/\.mp4$/, ".srt")], {
  stdio: "inherit",
});
