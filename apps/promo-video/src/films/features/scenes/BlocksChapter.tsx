/**
 * 「一个块，就是一种表达」：文档里敲 / 弹出斜杠菜单 → 8 个代表块卡点快切 → 回到文档。
 */
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, progress } from "../../../brand/motion";
import { fonts } from "../../../brand/tokens";
import { BeatMontage } from "../../../kit/BeatMontage";
import { StageFill } from "../../../kit/Stage";
import { useAppTheme } from "../../../app-kit/theme";
import { AppWindow } from "../../../app-kit/AppWindow";
import { ArticleEditorPage } from "../../../app-kit/pages/ArticleEditorPage";
import { CardCrumb } from "../../../app-kit/parts/Crumbs";
import { schedule } from "../../../app-kit/doc/script";
import { SlashMenu, SLASH_ITEMS } from "../../../app-kit/doc/SlashMenu";
import {
  AudioBlock,
  CalloutBlock,
  ClozeBlock,
  CodeShowcase,
  DatabaseBlock,
  DetailBlock,
  DocTasksBlock,
  GalleryBlock,
  HighlightBlock,
  MathShowcase,
  MermaidBlock,
  MusicBlock,
  TableBlock,
  TabsBlock,
  TaskListBlock,
  VideoBlock,
  WhiteboardBlock,
} from "../../../app-kit/doc/Blocks";
import { LIVE_BLOCKS, LIVE_TITLE } from "../../../mock/product";
import { beat, f, P } from "../timeline";

const done = schedule(LIVE_BLOCKS, -100000);

/** 块陈列：一整张纸上居中放一块，左上角是块名 */
function BlockStage({ name, children, width = 760 }: { name: string; children: ReactNode; width?: number }) {
  const appTheme = useAppTheme();
  return (
    <AbsoluteFill>
      <StageFill />
      <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
        <div
          data-theme={appTheme}
          data-mode="light"
          className="bg-surface shadow-paper rounded-tau-lg font-tau text-ink-1 relative px-14 pt-16 pb-14 text-[16px] leading-[1.65]"
          style={{ width: width + 112, transform: `scale(${width > 700 ? 1.45 : 1.38})` }}
        >
          <span className="text-ink-3 absolute top-6 left-14 text-[12px] tracking-[0.2em]" style={{ fontFamily: fonts.label }}>
            {name}
          </span>
          {children}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** 块陈列清单：每拍一块 */
export const BLOCK_CUTS: { name: string; width?: number; render: () => ReactNode }[] = [
  { name: "TABLE", render: () => <TableBlock /> },
  { name: "CODE", render: () => <CodeShowcase /> },
  { name: "MATH", render: () => <MathShowcase tex={String.raw`\int_0^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`} /> },
  { name: "CALLOUT", render: () => <CalloutBlock type="tip" text="一张卡片只写一个观点，标题就是这个观点本身。" /> },
  { name: "MERMAID", render: () => <MermaidBlock /> },
  { name: "GALLERY", render: () => <GalleryBlock /> },
  { name: "TABS", render: () => <TabsBlock /> },
  { name: "TASKS", render: () => <TaskListBlock /> },
  { name: "VIDEO", width: 640, render: () => <VideoBlock /> },
  { name: "HIGHLIGHT", render: () => <HighlightBlock /> },
  { name: "AUDIO", render: () => <AudioBlock /> },
  { name: "MUSIC · ABC", render: () => <MusicBlock /> },
  { name: "DETAILS", render: () => <DetailBlock /> },
  { name: "WHITEBOARD", width: 680, render: () => <WhiteboardBlock /> },
  { name: "FLASHCARD", render: () => <ClozeBlock /> },
  { name: "DOC TASKS", render: () => <DocTasksBlock /> },
  { name: "DATABASE", width: 680, render: () => <DatabaseBlock /> },
];

export function BlocksChapter() {
  const appTheme = useAppTheme();
  const frame = useCurrentFrame();
  const B = P.editor.blocks;
  const slashAt = f(B.slash);
  const open = progress(frame, slashAt + 8, 10, ease.out);
  // 选中项每半拍下移一格，停在「表格」
  const target = SLASH_ITEMS.findIndex(item => item.title === "表格");
  const steps = Math.min(target, Math.max(0, Math.floor((frame - slashAt - 18) / 7)));
  const scroll = Math.max(0, steps - 7) * 42;

  const count = Math.min(B.cutCount, BLOCK_CUTS.length);
  const bounds = Array.from({ length: count + 1 }, (_, i) => f(beat(B.cuts + i)));
  const cuts = bounds.slice(0, -1).map((_, i) => {
    const block = BLOCK_CUTS[i];
    return () => (
      <BlockStage name={block.name} width={block.width}>
        {block.render()}
      </BlockStage>
    );
  });
  const cutsStart = bounds[0];

  return (
    <AbsoluteFill>
      {frame < cutsStart && (
        <AbsoluteFill>
          <StageFill />
          <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
            <div style={{ transform: `scale(${1.9 + 0.1 * progress(frame, slashAt, f(1.6), ease.soft)}) translate(60px, -215px)` }}>
              <div style={{ position: "relative" }}>
                <AppWindow active="articles" crumb={<CardCrumb section="文章" title={LIVE_TITLE} />}>
                  <ArticleEditorPage title={LIVE_TITLE} titleCount={[...LIVE_TITLE].length} timed={done.slice(0, 4)} frame={frame} words={92} />
                </AppWindow>
                <div style={{ position: "absolute", left: 471, top: 468 }}>
                  <span className="text-ink-1 text-[16px]" style={{ fontFamily: "var(--tau-font)" }}>
                    /<i className="bg-ink-1 ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em]" />
                  </span>
                </div>
                {open > 0 && (
                  <div data-theme={appTheme} data-mode="light" className="font-tau" style={{ position: "absolute", left: 481, top: 502 }}>
                    <SlashMenu active={steps} scroll={scroll} open={open} />
                  </div>
                )}
              </div>
            </div>
          </AbsoluteFill>
        </AbsoluteFill>
      )}
      <BeatMontage bounds={bounds} cuts={cuts} />
    </AbsoluteFill>
  );
}
