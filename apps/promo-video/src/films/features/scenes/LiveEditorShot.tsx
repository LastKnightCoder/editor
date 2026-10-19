/**
 * 「所见即所得」：完整文章窗口，正文里逐块敲 Markdown 记号当场成型；每块的起点落在小节强拍上，
 * 镜头缓推并跟随正在写的块。
 */
import { useCurrentFrame } from "remotion";
import { ease } from "../../../brand/motion";
import { Place, World, type Shot } from "../../../kit/Camera";
import { AppWindow } from "../../../app-kit/AppWindow";
import { ArticleEditorPage } from "../../../app-kit/pages/ArticleEditorPage";
import { CardCrumb } from "../../../app-kit/parts/Crumbs";
import { bodyLength, schedule, type DocBlock } from "../../../app-kit/doc/script";
import { LIVE_BLOCKS, LIVE_TITLE } from "../../../mock/product";

/** 各块在文档里的估算高度（16px 正文），用于镜头跟随 */
const HEIGHT: Record<DocBlock["kind"], number> = { heading: 74, paragraph: 46, quote: 52, bullets: 120, math: 78, code: 118 };
const DOC_TOP = -255;
const DOC_X = 110;

export function LiveEditorShot({ titleAt, starts, endAt }: { titleAt: number; starts: number[]; endAt: number }) {
  const frame = useCurrentFrame();
  const timed = schedule(LIVE_BLOCKS, 0, starts);
  const titleCount = Math.max(0, Math.min([...LIVE_TITLE].length, Math.floor((frame - titleAt) / 4)));
  let y = DOC_TOP;
  const tops = timed.map(item => {
    const top = y;
    y += HEIGHT[item.block.kind];
    return top;
  });
  const shots: Shot[] = [
    { at: titleAt - 10, x: 0, y: -10, zoom: 1.24 },
    ...timed.map((item, i) => ({
      at: item.start + 12,
      x: DOC_X * (0.3 + 0.7 * (i / timed.length)),
      y: Math.max(-10, tops[i] + HEIGHT[item.block.kind] / 2 - 120),
      zoom: 1.28 + 0.16 * (i / (timed.length - 1)),
      ease: ease.inOut,
    })),
    { at: endAt, x: DOC_X, y: Math.max(-10, tops[tops.length - 1] - 60), zoom: 1.46, ease: ease.soft },
  ];
  const words = titleCount + timed.reduce((n, item) => n + (frame >= item.end ? bodyLength(item.block) : 0), 0);
  return (
    <World shots={shots}>
      {() => (
        <Place x={0} y={0}>
          <AppWindow active="articles" crumb={<CardCrumb section="文章" title={LIVE_TITLE} />}>
            <ArticleEditorPage title={LIVE_TITLE} titleCount={titleCount} timed={timed} frame={frame} words={words} />
          </AppWindow>
        </Place>
      )}
    </World>
  );
}
