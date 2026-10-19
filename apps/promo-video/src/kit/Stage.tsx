import { createContext, useContext, type ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { STAGES, type Stage } from "../brand/stage";
import { Grain } from "./Sky";

/** 舞台背景：底色 + 柔光晕 + 颗粒；drift 让光晕缓慢漂移 */
export function StageBackground({ stage, drift = 0 }: { stage: Stage; drift?: number }) {
  return (
    <AbsoluteFill style={{ background: stage.bg, overflow: "hidden" }}>
      {stage.glows.map((g, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: g.x,
            top: g.y,
            width: g.size,
            aspectRatio: "1",
            transform: `translate(-50%, -50%) translate(${Math.sin(drift * 0.6 + i * 2) * 60}px, ${Math.cos(drift * 0.5 + i) * 40}px)`,
            background: `radial-gradient(circle, ${g.color} 0%, transparent 65%)`,
            filter: "blur(20px)",
          }}
        />
      ))}
      <Grain opacity={stage.grain} />
    </AbsoluteFill>
  );
}

/** 品牌渐变字 */
export function brandText(stage: Stage): React.CSSProperties {
  return {
    backgroundImage: `linear-gradient(100deg, ${stage.brand[0]} 10%, ${stage.brand[1]} 90%)`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
}

const StageContext = createContext<Stage>(STAGES.studio);

export function StageProvider({ stage, children }: { stage: Stage; children: ReactNode }) {
  return <StageContext.Provider value={stage}>{children}</StageContext.Provider>;
}

export const useStage = () => useContext(StageContext);

/** 当前舞台的背景，光晕随时间缓慢漂移 */
export function StageFill() {
  const stage = useStage();
  const frame = useCurrentFrame();
  return <StageBackground stage={stage} drift={frame / 240} />;
}
