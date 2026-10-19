/**
 * 宣言样式对比（叙事 v2）：同一句写作宣言在三种处理下的样子。
 * a = 窗口退后虚化、字叠在上面；b = 官网式左文右窗（窗口 3D 斜放）；c = 初版整屏宣言。
 */
import { AbsoluteFill } from "remotion";
import { fonts } from "../../brand/tokens";
import { Manifesto } from "../../kit/Manifesto";
import { StageFill, useStage } from "../../kit/Stage";
import { AppWindow } from "../../app-kit/AppWindow";
import { ArticleEditorPage } from "../../app-kit/pages/ArticleEditorPage";
import { CardCrumb } from "../../app-kit/parts/Crumbs";
import { schedule } from "../../app-kit/doc/script";
import { ARTICLE } from "../../mock/deepwork";
import { MANIFESTOS } from "../product/copy";

export type ManifestoVariant = "a" | "b" | "c";

const done = schedule(ARTICLE.blocks, -100000);
const M = MANIFESTOS.write;

function ArticleWindow() {
  return (
    <AppWindow active="articles" crumb={<CardCrumb section="文章" title={ARTICLE.title} />}>
      <ArticleEditorPage title={ARTICLE.title} titleCount={99} timed={done} frame={0} words={3280} />
    </AppWindow>
  );
}

function Headline({ size, align }: { size: number; align: "center" | "left" }) {
  const stage = useStage();
  let index = 0;
  return (
    <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: size, letterSpacing: "0.04em", lineHeight: 1.25, color: stage.ink, textAlign: align }}>
      {(align === "center" ? [M.text] : ["所见，", "即所得。"]).map(line => (
        <div key={line}>
          {[...line].map(char => {
            const i = index++;
            return (
              <span key={i} style={{ color: i >= M.accent[0] && i < M.accent[1] ? stage.brand[0] : undefined }}>
                {char}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Sub({ align }: { align: "center" | "left" }) {
  const stage = useStage();
  return <div style={{ marginTop: 34, fontFamily: fonts.caption, fontSize: 30, letterSpacing: "0.2em", color: stage.ink2, textAlign: align }}>{M.sub}</div>;
}

/** blur：窗口模糊半径（px）；fog：字背后白雾的浓度（中心值，边缘按 0.4 倍） */
export function ManifestoProbe({ variant, blur = 14, fog = 0.82 }: { variant: ManifestoVariant; blur?: number; fog?: number }) {
  const stage = useStage();
  if (variant === "c") {
    return (
      <AbsoluteFill>
        <StageFill />
        <Manifesto text={M.text} sub={M.sub} accent={M.accent} at={-200} out={1000} size={118} />
      </AbsoluteFill>
    );
  }
  if (variant === "a") {
    return (
      <AbsoluteFill>
        <StageFill />
        <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
          <div style={{ transform: "scale(0.86)", filter: `blur(${blur}px)`, opacity: 0.9 }}>
            <ArticleWindow />
          </div>
        </AbsoluteFill>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(248,249,251,${fog}), rgba(248,249,251,${fog * 0.4}))` }} />
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <Headline size={118} align="center" />
          <Sub align="center" />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <StageFill />
      <div style={{ position: "absolute", left: 1010, top: 150, perspective: 2600 }}>
        <div style={{ transform: "scale(0.66) rotateY(-16deg) rotateX(4deg)", transformOrigin: "0% 50%" }}>
          <ArticleWindow />
        </div>
      </div>
      <div style={{ position: "absolute", left: 150, top: 0, bottom: 0, width: 820, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontFamily: fonts.label, fontSize: 20, letterSpacing: "0.3em", color: stage.brand[1], marginBottom: 30 }}>写作 · WRITING</div>
        <Headline size={104} align="left" />
        <Sub align="left" />
      </div>
    </AbsoluteFill>
  );
}
