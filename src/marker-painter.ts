class MarkerPainter {
  static get inputProperties(): string[] {
    return [
      "--marker-color",
      "--marker-offset",
      "font-size",
      "line-height",
      "--marker-roughness",
    ];
  }

  paint(
    ctx: PaintRenderingContext2D,
    geom: { width: number; height: number },
    props: Map<string, any>,
  ): void {
    const fontSize = (props.get("font-size") as CSSUnitValue).value;
    const lineHeightValue = props.get("line-height");
    const color = props.get("--marker-color").toString();

    // 处理 --marker-offset 的值，支持 em 单位
    let offset = 20; // 默认值
    const offsetValue = props.get("--marker-offset");
    if (typeof offsetValue === "string") {
      // 字符串情况，尝试解析
      const offsetStr = offsetValue.toString().trim();
      if (offsetStr.endsWith("em")) {
        // 处理 em 单位
        const emValue = parseFloat(offsetStr.slice(0, -2));
        if (!isNaN(emValue)) {
          offset = emValue * fontSize;
        }
      } else {
        // 处理纯数字或 px 单位
        offset = parseInt(offsetStr) || 20;
      }
    } else if (offsetValue instanceof CSSUnitValue) {
      // CSSUnitValue 情况
      if (offsetValue.unit === "em") {
        offset = offsetValue.value * fontSize;
      } else {
        offset = offsetValue.value;
      }
    }

    const roughness =
      parseFloat(props.get("--marker-roughness").toString()) || 0.3;

    let lineHeight: number;
    if (lineHeightValue instanceof CSSUnitValue) {
      lineHeight =
        lineHeightValue.unit === "number"
          ? lineHeightValue.value * fontSize
          : lineHeightValue.value;
    } else {
      lineHeight = fontSize * 1.8; // 默认行高
    }

    // 最终高度计算
    const autoHeight = lineHeight * 0.7;

    this.drawMarkerPath(ctx, geom, autoHeight, offset, roughness);
    this.addTexture(ctx, geom, color, roughness, offset, autoHeight);
  }

  private drawMarkerPath(
    ctx: PaintRenderingContext2D,
    geom: { width: number; height: number },
    height: number,
    offset: number,
    roughness: number,
  ): void {
    ctx.beginPath();

    // 起始点更多随机性
    const startYOffset = (Math.random() - 0.3) * roughness * 12;
    const startY = geom.height - offset + startYOffset;
    // 向左延伸一点，创造更自然的起笔效果
    const startX = -roughness * 10 - Math.random() * 10;
    ctx.moveTo(startX, startY);

    // 在开始处添加更明显的起笔效果（类似钢笔起笔时的弯曲）
    const entryX1 = startX + 8 + Math.random() * 5;
    const entryY1 = startY - (8 + Math.random() * 6) * roughness;
    const entryX2 = entryX1 + 10 + Math.random() * 8;
    const entryY2 = startY + (4 + Math.random() * 4) * roughness;
    ctx.bezierCurveTo(
      startX + 2,
      startY - roughness * 6,
      entryX1,
      entryY1,
      entryX2,
      entryY2,
    );

    // 控制点的数量，使曲线更自然
    const segments = Math.max(5, Math.floor(geom.width / 25));
    const pointGap = (geom.width - entryX2) / segments;

    // 使用贝塞尔曲线创建更自然的上边缘
    let prevX = entryX2;
    let prevY = entryY2;

    for (let i = 0; i <= segments; i++) {
      const x = entryX2 + i * pointGap;
      // 增加垂直方向的随机变化，使上边缘更加起伏明显
      const yVariation = (Math.random() - 0.4) * roughness * 15;
      const xVariation = (Math.random() - 0.5) * roughness * 6;
      const y = geom.height - offset + yVariation;

      // 添加压力变化，使线条宽度不均匀
      const cp1x =
        prevX + (x - prevX) / 3 + (Math.random() - 0.5) * roughness * 10;
      const cp1y = prevY + (Math.random() - 0.5) * roughness * 14;
      const cp2x = x - (x - prevX) / 3 + (Math.random() - 0.5) * roughness * 10;
      const cp2y = y + (Math.random() - 0.5) * roughness * 14;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x + xVariation, y);

      prevX = x + xVariation;
      prevY = y;
    }

    // 结尾处添加更明显的收笔效果
    const endingX = prevX + 15 + Math.random() * 10;
    const endingY = prevY + (Math.random() - 0.4) * roughness * 15;
    const endingCp1x = prevX + 6;
    const endingCp1y = prevY - roughness * 8;
    const endingCp2x = endingX - 8;
    const endingCp2y = endingY + roughness * 5;

    ctx.bezierCurveTo(
      endingCp1x,
      endingCp1y,
      endingCp2x,
      endingCp2y,
      endingX,
      endingY,
    );

    // 将收笔点连接到下边缘
    const rightEdgeY =
      geom.height - offset + height + (Math.random() - 0.5) * roughness * 10;
    ctx.lineTo(endingX, rightEdgeY);

    // 使用贝塞尔曲线创建更自然的下边缘
    prevX = endingX;
    prevY = rightEdgeY;

    for (let i = segments; i >= 0; i--) {
      const x = entryX2 + i * pointGap;
      // 下边缘的随机变化幅度更大，模拟手写时笔尖压力变化
      const yVariation = (Math.random() - 0.6) * roughness * 15;
      const xVariation = (Math.random() - 0.5) * roughness * 6;
      const y = geom.height - offset + height + yVariation;

      const cp1x =
        prevX - (prevX - x) / 3 + (Math.random() - 0.5) * roughness * 12;
      const cp1y = prevY + (Math.random() - 0.5) * roughness * 18;
      const cp2x = x + (prevX - x) / 3 + (Math.random() - 0.5) * roughness * 12;
      const cp2y = y + (Math.random() - 0.5) * roughness * 18;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x + xVariation, y);

      prevX = x + xVariation;
      prevY = y;
    }

    // 结束处添加收笔效果
    const finalX = startX;
    const finalY =
      geom.height - offset + height + (Math.random() - 0.3) * roughness * 12;
    const finalCp1x = prevX - 12 - Math.random() * 5;
    const finalCp1y = prevY + roughness * 6;
    const finalCp2x = finalX + 8;
    const finalCp2y = finalY - roughness * 8;

    ctx.bezierCurveTo(
      finalCp1x,
      finalCp1y,
      finalCp2x,
      finalCp2y,
      finalX,
      finalY,
    );

    // 闭合路径
    ctx.lineTo(startX, startY);
    ctx.closePath();
  }

  private addTexture(
    ctx: PaintRenderingContext2D,
    geom: { width: number; height: number },
    color: string,
    roughness: number,
    offset?: number,
    height?: number,
  ): void {
    const parseColor = (color: string): [number, number, number] => {
      // 统一转换为 RGB 数组
      if (color.startsWith("#")) {
        const hex = color.replace("#", "");
        const bigint = parseInt(hex, 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
      }

      const rgbaMatch = color.match(/[\d.]+/g);
      if (rgbaMatch && rgbaMatch.length >= 3) {
        return [
          parseInt(rgbaMatch[0]),
          parseInt(rgbaMatch[1]),
          parseInt(rgbaMatch[2]),
        ];
      }

      return [255, 212, 0]; // 默认黄色
    };

    const [r, g, b] = parseColor(color);
    const alphaBase = 0.3 * (1 - roughness); // 粗糙度影响透明度

    // 创建不均匀渐变，模拟墨水密度变化
    const gradient = ctx.createLinearGradient(0, 0, geom.width, 0);
    gradient.addColorStop(0, `rgba(${r},${g},${b},${alphaBase + 0.1})`);
    gradient.addColorStop(
      0.3,
      `rgba(${r},${g},${b},${alphaBase + 0.2 + Math.random() * 0.1})`,
    );
    gradient.addColorStop(
      0.7,
      `rgba(${r},${g},${b},${alphaBase + 0.15 + Math.random() * 0.1})`,
    );
    gradient.addColorStop(1, `rgba(${r},${g},${b},${alphaBase + 0.25})`);

    ctx.fillStyle = gradient;
    ctx.fill();

    // 添加笔触质感
    ctx.strokeStyle = `rgba(0,0,0,${0.1 * roughness})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 添加一些随机小斑点模拟墨水不均匀
    if (roughness > 0.2) {
      ctx.fillStyle = `rgba(${r},${g},${b},0.1)`;
      const spotCount = Math.floor((geom.width / 20) * roughness);

      for (let i = 0; i < spotCount; i++) {
        const x = Math.random() * geom.width;
        // 如果未提供 offset 和 height，则使用默认值
        const baseY =
          offset !== undefined ? geom.height - offset : geom.height - 16;
        const spotHeight = height !== undefined ? height : 20;
        const y = baseY + Math.random() * spotHeight;
        const radius = Math.random() * roughness * 3 + 0.5;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// @ts-ignore
registerPaint("marker-highlight", MarkerPainter);
