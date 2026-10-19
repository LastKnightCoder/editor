/**
 * 功能片：所见即所得 + 块（editor）、创作模式（compose）。场景沿用原时间轴的绝对帧，
 * 用负偏移的 Sequence 把区间起点对齐到影片 0 秒，配乐从同一处截起，拍点不变。
 */
import { AbsoluteFill, Sequence } from "remotion";
import { TRACKS } from "../../brand/music";
import { STAGES } from "../../brand/stage";
import { During } from "../../kit/During";
import { Manifesto } from "../../kit/Manifesto";
import { Soundtrack } from "../../kit/Soundtrack";
import { StageFill, StageProvider } from "../../kit/Stage";
import { AppThemeProvider } from "../../app-kit/theme";
import { MANIFESTOS } from "./copy";
import { BlocksChapter } from "./scenes/BlocksChapter";
import { ComposeChapter } from "./scenes/ComposeChapter";
import { LiveEditorShot } from "./scenes/LiveEditorShot";
import { bar, beat, f, FEATURE_RANGES, MUSIC_OFFSET, P } from "./timeline";

export type Feature = keyof typeof FEATURE_RANGES;

const STAGE = STAGES.studio;

export const featureDuration = (feature: Feature) => f(FEATURE_RANGES[feature][1] - FEATURE_RANGES[feature][0]);

function EditorFeature() {
  const E = P.editor;
  return (
    <>
      <During from={E.live.start - 0.2} to={E.live.end}>
        <LiveEditorShot titleAt={f(E.live.start) - 70} starts={[16, 17, 18, 19, 21, 22, 23].map(n => f(bar(n)))} endAt={f(E.live.end)} />
      </During>
      <During from={E.blocks.slash} to={E.blocks.end}>
        <BlocksChapter />
      </During>
      <Manifesto {...MANIFESTOS.wysiwyg} at={f(E.manifesto1[0])} out={f(E.manifesto1[1])} />
      <Manifesto {...MANIFESTOS.blocks} at={f(E.manifesto2[0])} out={f(E.manifesto2[1])} />
    </>
  );
}

function ComposeFeature() {
  const C = P.compose;
  return (
    <>
      <During from={beat(C.start)} to={beat(C.end)}>
        <ComposeChapter />
      </During>
      <Manifesto {...MANIFESTOS.compose} at={f(C.manifesto[0])} out={f(C.manifesto[1])} />
    </>
  );
}

const SCENES: Record<Feature, () => React.ReactNode> = { editor: EditorFeature, compose: ComposeFeature };

export function FeatureFilm({ feature }: { feature: Feature }) {
  const [start] = FEATURE_RANGES[feature];
  const Scenes = SCENES[feature];
  return (
    <StageProvider stage={STAGE}>
      <AppThemeProvider theme={STAGE.appTheme}>
        <AbsoluteFill>
          <StageFill />
          <Sequence from={-f(start)} layout="none">
            <Scenes />
          </Sequence>
          <Soundtrack track={TRACKS.motivationalTechnology} startAt={MUSIC_OFFSET + start} fadeIn={0.25} fadeOut={1.5} />
        </AbsoluteFill>
      </AppThemeProvider>
    </StageProvider>
  );
}
