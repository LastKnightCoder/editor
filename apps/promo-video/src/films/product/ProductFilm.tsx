import { AbsoluteFill } from "remotion";
import { TRACKS } from "../../brand/music";
import { STAGES } from "../../brand/stage";
import { During } from "../../kit/During";
import { Soundtrack } from "../../kit/Soundtrack";
import { StageFill, StageProvider } from "../../kit/Stage";
import { AppThemeProvider } from "../../app-kit/theme";
import { Opening } from "./scenes/Opening";
import { WriteChapter } from "./scenes/WriteChapter";
import { BoardChapter } from "./scenes/BoardChapter";
import { LifeChapter } from "./scenes/LifeChapter";
import { AiChapter } from "./scenes/AiChapter";
import { MapChapter } from "./scenes/MapChapter";
import { DailyChapter } from "./scenes/DailyChapter";
import { PluginChapter } from "./scenes/PluginChapter";
import { EndingChapter } from "./scenes/EndingChapter";
import { beat, f, MUSIC_OFFSET, P } from "./timeline";

export const PRODUCT_DURATION = f(P.end);
const STAGE = STAGES.studio;

export function ProductFilm() {
  return (
    <StageProvider stage={STAGE}>
      <AppThemeProvider theme={STAGE.appTheme}>
        <AbsoluteFill>
          <StageFill />
          <During to={P.opening.end}>
            <Opening />
          </During>
          <During from={P.write.start} to={P.write.end}>
            <WriteChapter />
          </During>
          <During from={beat(P.board.start)} to={beat(P.board.end)}>
            <BoardChapter />
          </During>
          <During from={beat(P.life.start)} to={beat(P.life.end)}>
            <LifeChapter />
          </During>
          <During from={beat(P.ai.start)} to={beat(P.ai.end)}>
            <AiChapter />
          </During>
          <During from={beat(P.map.start)} to={beat(P.map.end)}>
            <MapChapter />
          </During>
          <During from={beat(P.daily.start)} to={beat(P.daily.end)}>
            <DailyChapter />
          </During>
          <During from={beat(P.plugins.start)} to={beat(P.plugins.end)}>
            <PluginChapter />
          </During>
          <During from={P.ending.start} to={P.ending.end}>
            <EndingChapter />
          </During>
          <Soundtrack track={TRACKS.motivationalTechnology} startAt={MUSIC_OFFSET} fadeIn={0.25} fadeOut={1.5} />
        </AbsoluteFill>
      </AppThemeProvider>
    </StageProvider>
  );
}
