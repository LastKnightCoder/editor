/** 舞台配色对比：同一个开场构图在不同舞台下的样子 */
import { AbsoluteFill } from "remotion";
import { STAGES } from "../../brand/stage";
import { fonts } from "../../brand/tokens";
import { brandText, StageBackground } from "../../kit/Stage";
import { AppWindow } from "../../app-kit/AppWindow";
import { ArticleEditorPage } from "../../app-kit/pages/ArticleEditorPage";
import { CardCrumb } from "../../app-kit/parts/Crumbs";
import { AppThemeProvider } from "../../app-kit/theme";
import { schedule } from "../../app-kit/doc/script";
import { LIVE_BLOCKS, LIVE_TITLE } from "../../mock/product";

const done = schedule(LIVE_BLOCKS, -100000);

export function StyleProbe({ stage: key }: { stage: string }) {
  const stage = STAGES[key];
  return (
    <AppThemeProvider theme={stage.appTheme}>
      <AbsoluteFill>
        <StageBackground stage={stage} drift={1} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 96, textAlign: "center" }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 150, letterSpacing: "0.02em", lineHeight: 1 }}>
            <span style={{ display: "inline-block", ...brandText(stage) }}>Tau</span>
          </div>
          <div style={{ marginTop: 26, fontFamily: fonts.display, fontWeight: 600, fontSize: 44, letterSpacing: "0.16em", color: stage.ink }}>你的个人知识工作台</div>
          <div style={{ marginTop: 14, fontFamily: fonts.caption, fontSize: 22, letterSpacing: "0.3em", color: stage.ink2 }}>写作 · 思考 · 连接，都在一个地方</div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 400, display: "flex", justifyContent: "center", perspective: 2400 }}>
          <div style={{ transform: "scale(0.7) rotateX(22deg)", transformOrigin: "50% 0%" }}>
            <div style={{ boxShadow: stage.dark ? "0 0 120px 10px rgba(110,160,230,0.25)" : undefined, borderRadius: 14 }}>
              <AppWindow mode={stage.appMode} active="articles" crumb={<CardCrumb section="文章" title={LIVE_TITLE} />}>
                <ArticleEditorPage title={LIVE_TITLE} titleCount={99} timed={done} frame={0} words={312} />
              </AppWindow>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AppThemeProvider>
  );
}
