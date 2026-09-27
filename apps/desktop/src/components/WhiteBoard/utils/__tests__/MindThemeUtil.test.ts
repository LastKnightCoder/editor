import { describe, expect, it } from "vitest";
import { MIND_PALETTES, MIND_THEME_STYLES, getPaletteById } from "../../constants/mind-themes";
import {
  CANVAS_TONE,
  MIN_LINE_CONTRAST,
  MIN_TEXT_CONTRAST,
  MindThemeUtil,
  type MindMode,
} from "../MindThemeUtil";
import { contrast, hexTone } from "../oklch";

const MODES: MindMode[] = ["light", "dark"];
const LEVELS = [1, 2, 3, 4];

const combos = MIND_PALETTES.flatMap(palette =>
  MIND_THEME_STYLES.flatMap(({ value: style }) =>
    MODES.flatMap(mode =>
      LEVELS.flatMap(level =>
        (level === 1 ? [-1] : palette.hues.map((_, i) => i)).map(branch => ({
          palette: palette.id,
          style,
          mode,
          level,
          branch,
        }))
      )
    )
  )
);

describe("MindThemeUtil 对比度", () => {
  it.each(combos)("文字可读 %o", ({ palette, style, mode, level, branch }) => {
    const v = MindThemeUtil.getNodeVisual(
      { themeId: palette, themeStyle: style },
      level,
      branch,
      mode
    );
    const bg = v.background === "transparent" ? CANVAS_TONE[mode] : hexTone(v.background);
    expect(contrast(hexTone(v.textColor), bg)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it.each(combos.filter(c => c.level > 1))(
    "连线可见 %o",
    ({ palette, style, mode, level, branch }) => {
      const v = MindThemeUtil.getNodeVisual(
        { themeId: palette, themeStyle: style },
        level,
        branch,
        mode
      );
      expect(contrast(hexTone(v.lineColor), CANVAS_TONE[mode])).toBeGreaterThanOrEqual(
        MIN_LINE_CONTRAST
      );
    }
  );

  // 画布是 bg-surface（浅色近白、深色近黑），底色和节点浅底可能很接近；
  // 填色节点必须有描边或足够的底色差，边界才不会消失
  it.each(combos.filter(c => c.level > 1))(
    "填色节点有可见边界 %o",
    ({ palette, style, mode, level, branch }) => {
      const v = MindThemeUtil.getNodeVisual(
        { themeId: palette, themeStyle: style },
        level,
        branch,
        mode
      );
      if (v.background === "transparent") return;
      const surface = hexTone(mode === "light" ? "#fffdf9" : "#2e2820");
      const bounded = v.borderWidth > 0 || contrast(hexTone(v.background), surface) >= 1.25;
      expect(bounded).toBe(true);
    }
  );

  it.each(combos.filter(c => c.level === 1))(
    "根节点和画布区分开 %o",
    ({ palette, style, mode }) => {
      const v = MindThemeUtil.getNodeVisual({ themeId: palette, themeStyle: style }, 1, -1, mode);
      const edge = v.borderWidth > 0 ? v.borderColor : v.background;
      expect(contrast(hexTone(edge), CANVAS_TONE[mode])).toBeGreaterThanOrEqual(MIN_LINE_CONTRAST);
    }
  );
});

describe("MindThemeUtil 分支着色", () => {
  const root = {
    id: "r",
    children: [
      { id: "a", children: [{ id: "a1", children: [{ id: "a11" }] }] },
      { id: "b", children: [{ id: "b1" }] },
    ],
  };

  it("子孙继承二级分支序号", () => {
    expect(MindThemeUtil.getBranchIndex(root, "r")).toBe(-1);
    expect(MindThemeUtil.getBranchIndex(root, "a11")).toBe(0);
    expect(MindThemeUtil.getBranchIndex(root, "b1")).toBe(1);
  });

  it("不同分支颜色不同，同分支连线同色相", () => {
    const theme = { themeId: "classic", themeStyle: "solid" };
    const a = MindThemeUtil.getNodeVisual(theme, 2, 0, "light");
    const b = MindThemeUtil.getNodeVisual(theme, 2, 1, "light");
    expect(a.background).not.toBe(b.background);
    const a3 = MindThemeUtil.getNodeVisual(theme, 3, 0, "light");
    expect(a3.lineColor).toBe(a.lineColor);
  });
});

describe("旧主题兼容", () => {
  it("旧 id 映射到新配色，未知 id 回落默认", () => {
    expect(getPaletteById("rainbow").id).toBe("classic");
    expect(getPaletteById("hawaii").id).toBe("classic");
    expect(getPaletteById("nope").id).toBe("classic");
    expect(getPaletteById("ocean").id).toBe("ocean");
  });
});
