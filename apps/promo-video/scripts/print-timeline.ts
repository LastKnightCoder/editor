// 打印一支功能片的回放时间轴（章节卡、回放起止、状态时刻），写分镜和抽帧自检时换算帧号用：
//   pnpm timeline video-notes | video-notes-promo
export {};

const films: Record<string, () => Promise<{ chapters: unknown[]; ending?: unknown }>> = {
  "video-notes": () => import("../src/films/feature-films/video-notes/script.ts").then(m => ({ chapters: m.CHAPTERS })),
  "video-notes-promo": () => import("../src/films/feature-films/video-notes/promo-script.ts").then(m => ({ chapters: m.PROMO_CHAPTERS, ending: m.PROMO_ENDING_AT })),
};
const { layout } = await import("../src/films/feature-films/shared/timeline.ts");
const film = process.argv[2] ?? "video-notes";
const { chapters, ending } = await films[film]();
const timeline = layout(chapters as Parameters<typeof layout>[0], ending as Parameters<typeof layout>[1]);
const seconds = (frame: number) => `${(frame / 60).toFixed(1)}s`;
for (const { chapter, card, swap, replay } of timeline.chapters) {
  console.log(`■ ${chapter.id}${card ? ` 章节卡 ${card.at}–${card.out}` : ""}  换画面 ${swap}  回放 ${replay.start}–${replay.end}（${seconds(replay.start)}–${seconds(replay.end)}）`);
  for (const caption of replay.captions) console.log(`  字幕 ${caption.at} ${seconds(caption.at)}  ${caption.value}`);
  for (const [key, at] of Object.entries(replay.marks)) console.log(`  时刻 ${at} ${seconds(at)}  ${key}`);
}
console.log(`片尾 ${timeline.ending.at}–${timeline.ending.out}  全片 ${seconds(timeline.end)}`);
