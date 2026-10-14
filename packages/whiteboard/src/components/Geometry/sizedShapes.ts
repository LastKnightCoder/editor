/**
 * 圆弧半径须随实际尺寸保持正圆的形状：单位路径按宽高分别拉伸会把端头压成椭圆，
 * 故按元素宽高现算绝对坐标路径；未开口（不以 Z 结尾）的子路径只描边不填充。
 */
export const sizedShapePaths: Record<string, (width: number, height: number) => string[]> = {
  capsule: (width, height) => {
    const r = Math.min(width, height) / 2;
    return [
      `M ${r} 0 L ${width - r} 0 A ${r} ${r} 0 0 1 ${width} ${r} L ${width} ${height - r} ` +
        `A ${r} ${r} 0 0 1 ${width - r} ${height} L ${r} ${height} A ${r} ${r} 0 0 1 0 ${height - r} ` +
        `L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
    ];
  },
  cylinder: (width, height) => {
    const rx = width / 2;
    const ry = Math.min(width / 8, height / 4);
    return [
      `M 0 ${ry} A ${rx} ${ry} 0 0 1 ${width} ${ry} L ${width} ${height - ry} ` +
        `A ${rx} ${ry} 0 0 1 0 ${height - ry} Z`,
      `M 0 ${ry} A ${rx} ${ry} 0 0 0 ${width} ${ry}`,
    ];
  },
};

export const isClosedPath = (d: string) => /z\s*$/i.test(d);
