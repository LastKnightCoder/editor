/**
 * B 站封面静帧，两种版式：wide（16:9，1920×1080）左字右窗；standard（4:3，1440×1080）上字下窗。
 * 缩成列表缩略图时只认得出两行大字和窗口轮廓，所以字要大、字数要少；
 * B 站信息流在底部约 120px 叠播放量与时长，文字都放在这条带之上。
 */
import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { fonts } from "../../brand/tokens";
import { STAGES } from "../../brand/stage";
import { StageBackground, brandText, StageProvider } from "../../kit/Stage";
import { TauMark } from "../../kit/TauMark";
import { AppThemeProvider } from "../../app-kit/theme";
import { WINDOW } from "../../app-kit/AppWindow";
import { GALLERY_PAGES } from "../gallery/Gallery";
import { ArticleWindow } from "../product/scenes/WriteChapter";

export const COVER = {
  kicker: "Tau · 个人知识工作台",
  lines: ["让想法，", "长成体系。"],
  /** 第二行里染品牌渐变的字 */
  accent: "体系",
  features: ["所见即所得", "白板", "数据库", "知识地图", "AI"],
  badge: "免费 · 数据存在本地",
};

export const COVER_GLYPHS = COVER.kicker + COVER.lines.join("") + COVER.features.join("") + COVER.badge;

const STAGE = STAGES.studio;

/** 一扇倾斜的窗口：x/y 为窗口左上角，scale 按 1440×900 原尺寸缩放 */
function Tilted({ x, y, scale, rotate, z, children }: { x: number; y: number; scale: number; rotate: number; z: number; children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: WINDOW.width,
        height: WINDOW.height,
        zIndex: z,
        transformOrigin: "0 0",
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        borderRadius: 16,
        boxShadow: "0 40px 90px rgba(18, 32, 52, 0.28), 0 8px 24px rgba(18, 32, 52, 0.16)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export type CoverLayout = "wide" | "standard";

export const COVER_SIZE: Record<CoverLayout, { width: number; height: number }> = {
  wide: { width: 1920, height: 1080 },
  standard: { width: 1440, height: 1080 },
};

function Kicker() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <TauMark size={84} />
      <span style={{ fontFamily: fonts.caption, fontWeight: 500, fontSize: 40, letterSpacing: "0.08em", color: STAGE.ink2 }}>{COVER.kicker}</span>
    </div>
  );
}

function Title({ size, oneLine }: { size: number; oneLine: boolean }) {
  const [line1, line2] = COVER.lines;
  const accentAt = line2.indexOf(COVER.accent);
  const second = (
    <>
      {line2.slice(0, accentAt)}
      <span style={brandText(STAGE)}>{COVER.accent}</span>
      {line2.slice(accentAt + COVER.accent.length)}
    </>
  );
  return (
    <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: 1.16, letterSpacing: "0.02em", color: STAGE.ink, whiteSpace: "nowrap" }}>
      {oneLine ? (
        <div>
          {line1}
          {second}
        </div>
      ) : (
        <>
          <div>{line1}</div>
          <div>{second}</div>
        </>
      )}
    </div>
  );
}

function Chips() {
  return (
    <>
      {COVER.features.map(name => (
        <span
          key={name}
          style={{
            fontFamily: fonts.caption,
            fontWeight: 500,
            fontSize: 32,
            padding: "8px 22px",
            borderRadius: 999,
            color: STAGE.brand[0],
            background: "rgba(255,255,255,0.9)",
            border: "2px solid rgba(29, 78, 126, 0.22)",
          }}
        >
          {name}
        </span>
      ))}
    </>
  );
}

function Badge() {
  return (
    <span
      style={{
        fontFamily: fonts.caption,
        fontWeight: 600,
        fontSize: 34,
        letterSpacing: "0.12em",
        padding: "12px 30px",
        borderRadius: 12,
        color: "#fff",
        background: `linear-gradient(100deg, ${STAGE.brand[0]}, ${STAGE.brand[1]})`,
      }}
    >
      {COVER.badge}
    </span>
  );
}

/** 文字区压一层舞台底色，窗口伸进来时不和字打架 */
function Veil({ direction, from, to }: { direction: string; from: number; to: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        background: `linear-gradient(${direction}, #f6f8fb 0%, rgba(246,248,251,0.94) ${from}%, rgba(246,248,251,0) ${to}%)`,
      }}
    />
  );
}

/** 16:9：左侧两行大字，右侧白板在后、文章居中、知识地图在前 */
function WideCover() {
  return (
    <>
      <Tilted x={1010} y={40} scale={0.6} rotate={4} z={1}>
        <GALLERY_PAGES.board />
      </Tilted>
      <Tilted x={880} y={300} scale={0.62} rotate={-3} z={2}>
        <ArticleWindow />
      </Tilted>
      <Tilted x={1090} y={540} scale={0.6} rotate={2} z={3}>
        <GALLERY_PAGES.deepMapInsight />
      </Tilted>
      <Veil direction="90deg" from={36} to={48} />
      <div style={{ position: "absolute", zIndex: 5, left: 110, top: 104, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <Kicker />
        <div style={{ marginTop: 40 }}>
          <Title size={168} oneLine={false} />
        </div>
        <div style={{ marginTop: 44, display: "flex", gap: 14 }}>
          <Chips />
        </div>
        <div style={{ marginTop: 26 }}>
          <Badge />
        </div>
      </div>
    </>
  );
}

/** 4:3：上方一行大字与胶囊，下方三扇窗口扇形摊开（底部叠播放量的那条带只压到窗口） */
function StandardCover() {
  return (
    <>
      <Tilted x={-60} y={640} scale={0.5} rotate={-5} z={1}>
        <GALLERY_PAGES.board />
      </Tilted>
      <Tilted x={820} y={600} scale={0.5} rotate={5} z={2}>
        <GALLERY_PAGES.deepMapInsight />
      </Tilted>
      <Tilted x={330} y={560} scale={0.56} rotate={0} z={3}>
        <ArticleWindow />
      </Tilted>
      <Veil direction="180deg" from={44} to={56} />
      <div style={{ position: "absolute", zIndex: 5, left: 90, top: 80, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <Kicker />
        <div style={{ marginTop: 34 }}>
          <Title size={140} oneLine />
        </div>
        <div style={{ marginTop: 36, display: "flex", gap: 12, alignItems: "center" }}>
          <Chips />
        </div>
        <div style={{ marginTop: 22 }}>
          <Badge />
        </div>
      </div>
    </>
  );
}

export function BilibiliCover({ layout = "wide" }: { layout?: CoverLayout }) {
  return (
    <StageProvider stage={STAGE}>
      <AppThemeProvider theme={STAGE.appTheme}>
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <StageBackground stage={STAGE} />
          {layout === "wide" ? <WideCover /> : <StandardCover />}
        </AbsoluteFill>
      </AppThemeProvider>
    </StageProvider>
  );
}
