/** 星图落进软件里的「知识地图」窗口（深色），展开 AI 洞见侧栏 */
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, progress } from "../../../brand/motion";
import { AppWindow } from "../../../app-kit/AppWindow";
import { KnowledgeMapPage } from "../../../app-kit/pages/KnowledgeMapPage";
import { OLD_CARD_ID, TODAY_IDS } from "../../../mock/map";
import { f, T } from "../timeline";

export function MapWindowScene() {
  const frame = useCurrentFrame();
  const appear = progress(frame, f(T.stars.toWindow[0]) + 18, f(1.3), ease.out);
  const exit = progress(frame, f(T.map.exit[0]), f(T.map.exit[1] - T.map.exit[0]), ease.inOut);
  const push = progress(frame, f(T.stars.toWindow[1]), f(T.map.exit[0] - T.stars.toWindow[1]), ease.soft);
  const insight = progress(frame, f(T.map.insight[0]), f(T.map.insight[1] - T.map.insight[0]), ease.inOut);
  const scale = 1.12 * (1.05 - 0.05 * appear) * (1 + push * 0.035) * (1 + exit * 0.06);
  return (
    <AbsoluteFill style={{ display: "grid", placeItems: "center", opacity: appear * (1 - exit), filter: exit > 0 ? `blur(${exit * 8}px)` : undefined }}>
      <div style={{ transform: `scale(${scale})` }}>
        <AppWindow active="knowledge-map" mode="dark" mapActive crumb="知识地图">
          <KnowledgeMapPage
            report={progress(frame, f(T.map.report), 36, ease.out)}
            canvas={{
              insight,
              todayGlow: 1,
              titles: [
                { id: TODAY_IDS.card, opacity: progress(frame, f(T.map.insight[1]) - 20, 24) },
                { id: OLD_CARD_ID, opacity: progress(frame, f(T.map.insight[1]) - 20, 24), above: true },
              ],
            }}
          />
        </AppWindow>
      </div>
    </AbsoluteFill>
  );
}
