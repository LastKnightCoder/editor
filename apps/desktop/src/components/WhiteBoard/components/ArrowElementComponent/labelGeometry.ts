import { Point } from "../../types";

export interface LabelAnchor {
  x: number;
  y: number;
  angle: number;
}

const FULL_TURN = 360;
const HALF_TURN = 180;

const normalizeAngle = (angle: number) => {
  let normalized = angle % FULL_TURN;
  if (normalized > HALF_TURN) {
    normalized -= FULL_TURN;
  }
  if (normalized <= -HALF_TURN) {
    normalized += FULL_TURN;
  }
  return normalized;
};

export const normalizeReadableAngle = (angle: number) => {
  const normalized = normalizeAngle(angle);
  if (normalized > 90) {
    return normalized - HALF_TURN;
  }
  if (normalized < -90) {
    return normalized + HALF_TURN;
  }
  return normalized;
};

const toAngle = (dx: number, dy: number) => {
  return normalizeReadableAngle((Math.atan2(dy, dx) * HALF_TURN) / Math.PI);
};

export const getFallbackLabelAnchor = (points: Point[]): LabelAnchor | null => {
  if (points.length < 2) {
    return null;
  }

  let totalLength = 0;
  const segments = points
    .slice(1)
    .map((end, index) => {
      const start = points[index];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      totalLength += length;
      return { start, end, dx, dy, length };
    })
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return null;
  }

  const halfLength = totalLength / 2;
  let consumedLength = 0;

  for (const segment of segments) {
    const nextLength = consumedLength + segment.length;
    if (halfLength <= nextLength) {
      const ratio = (halfLength - consumedLength) / segment.length;
      return {
        x: segment.start.x + segment.dx * ratio,
        y: segment.start.y + segment.dy * ratio,
        angle: toAngle(segment.dx, segment.dy),
      };
    }
    consumedLength = nextLength;
  }

  const lastSegment = segments[segments.length - 1];
  return {
    x: lastSegment.end.x,
    y: lastSegment.end.y,
    angle: toAngle(lastSegment.dx, lastSegment.dy),
  };
};

export const getLabelAnchorByPath = (
  pathString: string,
  fallbackPoints: Point[],
): LabelAnchor | null => {
  if (pathString && typeof document !== "undefined") {
    try {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", pathString);
      const totalLength = path.getTotalLength();

      if (Number.isFinite(totalLength) && totalLength > 0) {
        const middle = totalLength / 2;
        const epsilon = Math.min(1, totalLength / 200);
        const prev = path.getPointAtLength(Math.max(0, middle - epsilon));
        const next = path.getPointAtLength(
          Math.min(totalLength, middle + epsilon),
        );

        return {
          x: (prev.x + next.x) / 2,
          y: (prev.y + next.y) / 2,
          angle: toAngle(next.x - prev.x, next.y - prev.y),
        };
      }
    } catch {
      return getFallbackLabelAnchor(fallbackPoints);
    }
  }

  return getFallbackLabelAnchor(fallbackPoints);
};

export const offsetAnchorAlongNormal = (
  anchor: LabelAnchor,
  offset: number,
): LabelAnchor => {
  if (offset === 0) {
    return anchor;
  }
  const angleRad = (anchor.angle * Math.PI) / HALF_TURN;
  const normalX = Math.sin(angleRad);
  const normalY = -Math.cos(angleRad);
  return {
    x: anchor.x + normalX * offset,
    y: anchor.y + normalY * offset,
    angle: anchor.angle,
  };
};
