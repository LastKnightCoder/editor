// 把主片字幕数据导出为 SRT（B 站 CC 字幕可直接上传）
import { writeFileSync } from "node:fs";
import { toSrt } from "../src/kit/srt.ts";
import { CUES } from "../src/films/day/copy.ts";

const output = process.argv[2] ?? "out/DayInLife.srt";
writeFileSync(output, toSrt(CUES));
console.log(`SRT → ${output}（${CUES.length} 条）`);
