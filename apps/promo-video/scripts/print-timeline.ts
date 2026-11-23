// 打印一支功能片的回放时间轴（章节卡、回放起止、状态时刻），写分镜和抽帧自检时换算帧号用：
//   node --experimental-strip-types scripts/print-timeline.ts video-notes
export {};

const films: Record<string, () => Promise<{ chapters: unknown[] }>> = {
  "video-notes": () => import("../src/films/feature-films/video-notes/script.ts").then(m => ({ chapters: m.CHAPTERS })),
};
const { layout } = await import("../src/films/feature-films/shared/timeline.ts");
const film = process.argv[2] ?? "video-notes";
const { chapters } = await films[film]();
const timeline = layout(chapters as Parameters<typeof layout>[0]);
const seconds = (frame: number) => `${(frame / 60).toFixed(1)}s`;
for (const { chapter, card, swap, replay } of timeline.chapters) {
  console.log(`■ ${chapter.id}${card ? ` 章节卡 ${card.at}–${card.out}` : ""}  换画面 ${swap}  回放 ${replay.start}–${replay.end}（${seconds(replay.start)}–${seconds(replay.end)}）`);
  for (const caption of replay.captions) console.log(`  字幕 ${caption.at} ${seconds(caption.at)}  ${caption.value}`);
  for (const [key, at] of Object.entries(replay.marks)) console.log(`  时刻 ${at} ${seconds(at)}  ${key}`);
}
console.log(`片尾 ${timeline.ending.at}–${timeline.ending.out}  全片 ${seconds(timeline.end)}`);
