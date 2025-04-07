class MarkerPainter {
  static get inputProperties() {
    return ["--marker-color", "font-size", "line-height", "--marker-roughness"];
  }

  paint(ctx, geom, props) {
    const fontSize = props.get("font-size").value;
    const lineHeightValue = props.get("line-height");
    const color = props.get("--marker-color").toString();

    const roughness =
      parseFloat(props.get("--marker-roughness").toString()) || 0.3;

    let lineHeight;
    if (lineHeightValue instanceof CSSUnitValue) {
      lineHeight =
        lineHeightValue.unit === "number"
          ? lineHeightValue.value * fontSize
          : lineHeightValue.value;
    } else {
      lineHeight = fontSize * 1.8; // 默认行高
    }

    // 计算高亮区域的高度和位置
    // 确保完全覆盖文字，所以高度比字体大小大，上下都留有足够余量
    const markerHeight = fontSize * 1.2; // 高亮高度比字体大，确保完全覆盖

    // 计算baseY，使高亮区域完全覆盖文字
    const textBottom = geom.height; // 文字底部位置
    const baseY = textBottom; // 高亮底部与文字底部对齐
    const topY = baseY - markerHeight; // 高亮顶部

    this.drawHighlighterShape(ctx, geom, topY, baseY, roughness, fontSize);
    this.applyHighlighterEffect(ctx, geom, color, roughness);
  }

  drawHighlighterShape(ctx, geom, topY, baseY, roughness, fontSize) {
    ctx.beginPath();

    // 放大参数，增加曲线幅度
    // 根据图片中荧光笔特性设置参数，增大边缘凸起的变化程度
    const edgeVariation = roughness * 2.0; // 增大边缘凸起变化程度
    const horizontalBulge = fontSize * 0.15; // 增大荧光笔两端凸起的程度

    // 左上角起点，更明显的向内凹
    const startX = 0;
    const startY = topY + edgeVariation * 2.5;
    ctx.moveTo(startX, startY);

    // 上边缘为更明显的弧形，模拟荧光笔压力变化
    // 上边缘中部更明显地上凸
    const topMidX = geom.width / 2;
    const topMidY = topY - edgeVariation * 1.5; // 增大上凸幅度
    const rightTopX = geom.width;
    const rightTopY = topY + edgeVariation * 2.5;

    // 上边缘使用二次贝塞尔曲线，增大曲率
    ctx.quadraticCurveTo(topMidX, topMidY, rightTopX, rightTopY);

    // 右边缘更明显地向外凸
    const rightMidX = geom.width + horizontalBulge * 1.5;
    const rightMidY = (topY + baseY) / 2;
    const rightBottomX = geom.width;
    const rightBottomY = baseY - edgeVariation * 2.5;

    // 右边缘使用二次贝塞尔曲线，增大曲率
    ctx.quadraticCurveTo(rightMidX, rightMidY, rightBottomX, rightBottomY);

    // 下边缘为更明显的弧形，中部更明显地下凸
    const bottomMidX = geom.width / 2;
    const bottomMidY = baseY + edgeVariation * 1.5; // 增大下凸幅度
    const leftBottomX = 0;
    const leftBottomY = baseY - edgeVariation * 2.5;

    // 下边缘使用二次贝塞尔曲线，增大曲率
    ctx.quadraticCurveTo(bottomMidX, bottomMidY, leftBottomX, leftBottomY);

    // 左边缘更明显地向外凸
    const leftMidX = -horizontalBulge * 1.5;
    const leftMidY = (topY + baseY) / 2;

    // 左边缘使用二次贝塞尔曲线闭合路径，增大曲率
    ctx.quadraticCurveTo(leftMidX, leftMidY, startX, startY);
  }

  applyHighlighterEffect(ctx, geom, color, roughness) {
    const parseColor = (color) => {
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

    // 根据图片中荧光笔特性设置透明度和颜色
    // 明亮有光泽的颜色
    const baseAlpha = 0.45; // 增加基础透明度使效果更明显

    // 创建从上到下的渐变，接近图中的效果
    const gradient = ctx.createLinearGradient(0, 0, 0, geom.height);

    // 渐变顶部稍浅
    gradient.addColorStop(0, `rgba(${r},${g},${b},${baseAlpha * 0.9})`);

    // 渐变中部最深，有光泽感
    gradient.addColorStop(0.5, `rgba(${r},${g},${b},${baseAlpha * 1.1})`);

    // 渐变底部同样稍浅
    gradient.addColorStop(1, `rgba(${r},${g},${b},${baseAlpha * 0.9})`);

    // 使用渐变填充
    ctx.fillStyle = gradient;
    ctx.fill();

    // 添加轻微的边缘线，增强荧光笔效果
    ctx.strokeStyle = `rgba(${r},${g},${b},${baseAlpha * 1.2})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 添加轻微的高光反射效果
    this.addHighlight(ctx, geom, r, g, b);
  }

  addHighlight(ctx, geom, r, g, b) {
    // 创建高光效果，模拟荧光笔的反光
    ctx.beginPath();

    // 在荧光笔顶部靠左位置添加一个细长的高光反射条
    const highlightWidth = geom.width * 0.6;
    const highlightHeight = geom.height * 0.15;
    const startX = geom.width * 0.1;
    const startY = geom.height * 0.15;

    // 创建高光形状
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      startX + highlightWidth * 0.3,
      startY - highlightHeight * 0.2,
      startX + highlightWidth * 0.7,
      startY - highlightHeight * 0.2,
      startX + highlightWidth,
      startY + highlightHeight,
    );
    ctx.bezierCurveTo(
      startX + highlightWidth * 0.7,
      startY + highlightHeight * 1.5,
      startX + highlightWidth * 0.3,
      startY + highlightHeight * 1.3,
      startX,
      startY,
    );

    // 使用白色半透明渐变填充高光效果
    const highlightGradient = ctx.createLinearGradient(
      startX,
      startY,
      startX + highlightWidth * 0.5,
      startY + highlightHeight,
    );
    highlightGradient.addColorStop(0, `rgba(255, 255, 255, 0.12)`);
    highlightGradient.addColorStop(0.5, `rgba(255, 255, 255, 0.07)`);
    highlightGradient.addColorStop(1, `rgba(255, 255, 255, 0)`);

    ctx.fillStyle = highlightGradient;
    ctx.fill();
  }
}

registerPaint("marker-highlight", MarkerPainter);
