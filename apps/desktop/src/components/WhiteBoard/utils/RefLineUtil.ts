import { EHandlerPosition } from "../types";

// 超过该距离的参考线视为离当前操作过远，不参与吸附
const MAX_REF_LINE_GAP = 500;

export interface Rect {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Line {
  key: string;
  type: "vertical" | "horizontal"; // 水平或垂直
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export class RefLineUtil {
  refRects: Rect[];
  refLines: Line[];

  current: {
    rects: Rect[];
    lines: Line[];
  };

  private onChange?: () => void;

  constructor({
    refRects,
    refLines,
    onChange,
  }: {
    refRects?: Rect[];
    refLines?: Line[];
    onChange?: () => void;
  }) {
    this.refRects = refRects || [];
    this.refLines = refLines || [];
    this.current = {
      rects: [],
      lines: [],
    };
    this.onChange = onChange;
  }

  private notifyChange() {
    this.onChange?.();
  }

  addRefRects(rects: Rect[]) {
    // 将重复的删掉
    this.refRects = this.refRects.filter((rect) => {
      return !rects.some((otherRect) => {
        return rect.key === otherRect.key;
      });
    });
    this.refRects = this.refRects.concat(rects);
    this.notifyChange();
  }

  addRefRect(rect: Rect) {
    this.addRefRects([rect]);
  }

  setRefRects(rects: Rect[]) {
    this.refRects = rects;
    this.notifyChange();
  }

  removeRefRects(keys: string[]) {
    this.refRects = this.refRects.filter((rect) => !keys.includes(rect.key));
    this.notifyChange();
  }

  removeRefRect(key: string) {
    this.removeRefRects([key]);
  }

  removeRefLines(keys: string[]) {
    this.refLines = this.refLines.filter((line) => !keys.includes(line.key));
    this.notifyChange();
  }

  removeRefLine(key: string) {
    this.removeRefLines([key]);
  }

  addRefLines(lines: Line[]) {
    const isValid = lines.every(this.checkIsValidLine);
    if (!isValid) {
      console.error("lines is not valid");
      return;
    }
    // 将重复的删掉
    this.refLines = this.refLines.filter((line) => {
      return !lines.some((otherLine) => {
        return line.key === otherLine.key;
      });
    });
    this.refLines = this.refLines.concat(lines);
    this.notifyChange();
  }

  addRefLine(line: Line) {
    this.addRefLines([line]);
  }

  setRefLines(lines: Line[]) {
    this.refLines = lines;
    this.notifyChange();
  }

  checkIsValidLine(line: Line) {
    // 必须是水平线或垂直线
    if (line.type === "vertical") {
      return line.x1 === line.x2;
    } else if (line.type === "horizontal") {
      return line.y1 === line.y2;
    } else {
      return false;
    }
  }

  setCurrentRects(rects: Rect[]) {
    this.current.rects = rects;
    this.notifyChange();
  }

  addCurrentRects(rects: Rect[]) {
    const uniqueRects = this.current.rects.filter((rect) => {
      return !rects.some((otherRect) => {
        return rect.key === otherRect.key;
      });
    });
    this.current.rects = uniqueRects.concat(rects);
    this.notifyChange();
  }

  setCurrentLines(lines: Line[]) {
    this.current.lines = lines;
    this.notifyChange();
  }

  setCurrent({ rects, lines }: { rects: Rect[]; lines: Line[] }) {
    this.current.rects = rects;
    this.current.lines = lines;
    this.notifyChange();
  }

  private extractLinesFromRect(rect: Rect): Line[] {
    return [
      {
        key: rect.key + "-top",
        type: "horizontal",
        x1: rect.x,
        y1: rect.y,
        x2: rect.x + rect.width,
        y2: rect.y,
      },
      {
        key: rect.key + "-bottom",
        type: "horizontal",
        x1: rect.x,
        y1: rect.y + rect.height,
        x2: rect.x + rect.width,
        y2: rect.y + rect.height,
      },
      {
        key: rect.key + "-left",
        type: "vertical",
        x1: rect.x,
        y1: rect.y,
        x2: rect.x,
        y2: rect.y + rect.height,
      },
      {
        key: rect.key + "-right",
        type: "vertical",
        x1: rect.x + rect.width,
        y1: rect.y,
        x2: rect.x + rect.width,
        y2: rect.y + rect.height,
      },
    ];
  }

  private getLineDistance(currentLine: Line, refLine: Line): number {
    if (currentLine.type === refLine.type) {
      // 如果是同类型（都为水平或垂直），则可以求距离
      if (currentLine.type === "horizontal") {
        return refLine.y1 - currentLine.y1;
      } else {
        return refLine.x1 - currentLine.x1;
      }
    } else {
      return Infinity;
    }
  }

  private getLineRange(line: Line): [number, number] {
    if (line.type === "vertical") {
      return [Math.min(line.y1, line.y2), Math.max(line.y1, line.y2)];
    }
    return [Math.min(line.x1, line.x2), Math.max(line.x1, line.x2)];
  }

  private isLineWithinRange(
    currentLine: Line,
    refLine: Line,
    maxGap: number,
  ): boolean {
    if (currentLine.type !== refLine.type) {
      return false;
    }
    if (!Number.isFinite(maxGap) || maxGap <= 0) {
      return true;
    }
    const [currentStart, currentEnd] = this.getLineRange(currentLine);
    const [refStart, refEnd] = this.getLineRange(refLine);
    if (currentEnd < refStart) {
      return refStart - currentEnd <= maxGap;
    }
    if (refEnd < currentStart) {
      return currentStart - refEnd <= maxGap;
    }
    return true;
  }

  getUpdateCurrent(
    adsorb = false,
    adsorbDistance: number,
    isResize = false,
    position?: EHandlerPosition,
  ) {
    // 如果不吸附，直接返回
    if (!adsorb || !adsorbDistance) {
      return {
        rects: this.current.rects,
        lines: this.current.lines,
      };
    }

    const excludeKeys = [
      ...this.current.rects.map((rect) => rect.key),
      ...this.current.lines.map((line) => line.key),
    ];

    // 如果吸附，找到最近的垂直线和水平线，整体移动 current
    const matchLines = this.matchRefLines(adsorbDistance, excludeKeys);
    // 获取匹配到的水平线和垂直线
    const verticalLines = matchLines
      .filter((line) => line.type === "vertical")
      .toSorted((a, b) => a.distance - b.distance);
    const horizontalLines = matchLines
      .filter((line) => line.type === "horizontal")
      .toSorted((a, b) => a.distance - b.distance);

    // 分别找到离水平线和垂直线最近的线的距离，然后整体移动，向右为正，向下为正
    const newCurrent = {
      rects: this.current.rects.map((rect) => {
        if (verticalLines.length > 0) {
          const verticalLine = verticalLines[0];
          if (isResize && position) {
            if (
              [
                EHandlerPosition.TopLeft,
                EHandlerPosition.BottomLeft,
                EHandlerPosition.Left,
              ].includes(position)
            ) {
              rect.x = rect.x + verticalLine.distance;
            } else {
              rect.width = rect.width + verticalLine.distance;
            }
          } else {
            rect.x = rect.x + verticalLine.distance;
          }
        }
        if (horizontalLines.length > 0) {
          const horizontalLine = horizontalLines[0];
          if (isResize && position) {
            if (
              [
                EHandlerPosition.TopLeft,
                EHandlerPosition.TopRight,
                EHandlerPosition.Top,
              ].includes(position)
            ) {
              rect.y = rect.y + horizontalLine.distance;
            } else {
              rect.height = rect.height + horizontalLine.distance;
            }
          } else {
            rect.y = rect.y + horizontalLine.distance;
          }
        }
        return rect;
      }),
      lines: this.current.lines.map((line) => {
        if (verticalLines.length > 0) {
          const verticalLine = verticalLines[0];
          line.x1 = line.x1 + verticalLine.distance;
          line.x2 = line.x2 + verticalLine.distance;
        }
        if (horizontalLines.length > 0) {
          const horizontalLine = horizontalLines[0];
          line.y1 = line.y1 + horizontalLine.distance;
          line.y2 = line.y2 + horizontalLine.distance;
        }
        return line;
      }),
    };

    return newCurrent;
  }

  // 矩形和线全部拆开为线进行匹配，只要距离小于 distance 就认为是匹配到了
  matchRefLines(
    distance: number,
    excludeRefKeys: string[] = [],
    maxRefGap = MAX_REF_LINE_GAP,
  ): Array<Line & { distance: number }> {
    const excludeKeys = [
      ...this.current.rects.map((rect) => rect.key),
      ...this.current.lines.map((line) => line.key),
    ];
    const mergedExcludeKeys = [...new Set([...excludeKeys, ...excludeRefKeys])];
    const currentLines = this.current.rects
      .flatMap(this.extractLinesFromRect)
      .concat(this.current.lines);
    const refLines = this.refRects
      .filter((rect) => !mergedExcludeKeys.includes(rect.key))
      .flatMap(this.extractLinesFromRect)
      .concat(
        this.refLines.filter((line) => !mergedExcludeKeys.includes(line.key)),
      );

    const matchedLines: Array<Line & { distance: number }> = [];

    // 比较当前线与所有参考线
    for (const currentLine of currentLines) {
      for (const refLine of refLines) {
        if (!this.isLineWithinRange(currentLine, refLine, maxRefGap)) {
          continue;
        }
        const dist = this.getLineDistance(currentLine, refLine);
        if (Math.abs(dist) < distance) {
          if (matchedLines.find((line) => line.key === refLine.key)) continue;
          if (currentLine.type === refLine.type) {
            if (currentLine.type === "horizontal") {
              matchedLines.push({
                key: refLine.key,
                type: refLine.type,
                x1: Math.min(
                  currentLine.x1,
                  currentLine.x2,
                  refLine.x1,
                  refLine.x2,
                ),
                y1: refLine.y1,
                x2: Math.max(
                  currentLine.x1,
                  currentLine.x2,
                  refLine.x1,
                  refLine.x2,
                ),
                y2: refLine.y2,
                distance: dist,
              });
            } else {
              matchedLines.push({
                key: refLine.key,
                type: refLine.type,
                x1: refLine.x1,
                y1: Math.min(
                  currentLine.y1,
                  currentLine.y2,
                  refLine.y1,
                  refLine.y2,
                ),
                x2: refLine.x2,
                y2: Math.max(
                  currentLine.y1,
                  currentLine.y2,
                  refLine.y1,
                  refLine.y2,
                ),
                distance: dist,
              });
            }
          }
        }
      }
    }

    return matchedLines;
  }
}

export default RefLineUtil;
