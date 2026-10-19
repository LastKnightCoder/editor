import { Img, staticFile } from "remotion";

/** 应用图标：自带圆角与米白底，size 为边长 */
export function TauMark({ size, glow = 0 }: { size: number; glow?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {glow > 0 && (
        <div
          style={{
            position: "absolute",
            inset: -size * 0.9,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(230,196,127,${0.38 * glow}) 0%, rgba(230,196,127,0) 62%)`,
          }}
        />
      )}
      <Img
        src={staticFile("tau-logo.png")}
        style={{
          position: "relative",
          width: size,
          height: size,
          filter: "drop-shadow(0 18px 30px rgba(22,34,49,0.22))",
        }}
      />
    </div>
  );
}
