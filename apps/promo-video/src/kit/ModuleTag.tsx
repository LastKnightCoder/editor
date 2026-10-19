import { useCurrentFrame } from "remotion";
import { ease, progress } from "../brand/motion";
import { fonts } from "../brand/tokens";
import { useStage } from "./Stage";

/** 画面底部居中的模块标签：「01 输入 · 浏览器插件划线」，交代当前在哪个模块、演示什么 */
export function ModuleTag({ index, module, feature, at, out }: { index?: string; module: string; feature: string; at: number; out: number }) {
  const frame = useCurrentFrame();
  const stage = useStage();
  const t = progress(frame, at, 16) * (1 - progress(frame, out - 12, 12, ease.in));
  if (t <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 64,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "11px 26px 11px 12px",
        borderRadius: 999,
        // 不用 backdrop-filter：多标签页并行渲染时 Chrome 偶尔整层丢帧，成片里标签一闪一闪（交接文档坑 24）
        background: "rgba(252, 253, 255, 0.96)",
        boxShadow: "0 0 0 1px rgba(22,34,49,0.06), 0 14px 36px -14px rgba(22,34,49,0.35)",
        opacity: t,
        transform: `translate(-50%, ${(1 - t) * 10}px)`,
        zIndex: 50,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: fonts.caption,
          fontWeight: 600,
          fontSize: 24,
          color: "#fff",
          background: stage.brand[0],
          borderRadius: 999,
          padding: "4px 16px",
        }}
      >
        {index && <span style={{ fontFamily: fonts.label, fontSize: 18, opacity: 0.75 }}>{index}</span>}
        {module}
      </span>
      <span style={{ fontFamily: fonts.caption, fontSize: 26, color: stage.ink, letterSpacing: "0.04em" }}>{feature}</span>
    </div>
  );
}
