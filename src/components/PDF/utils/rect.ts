import { Rect, RectPercent } from "@/types";

export const transformToRelativeRect = (rect: Rect, pageRect: Rect) => {
  return {
    left: rect.left - pageRect.left,
    top: rect.top - pageRect.top,
    width: rect.width,
    height: rect.height,
  };
}

export const transformToAbsoluteRect = (rect: Rect, pageRect: Rect) => {
  return {
    left: rect.left + pageRect.left,
    top: rect.top + pageRect.top,
    width: rect.width,
    height: rect.height,
  };
}

export const transformToPercentRect = (rect: Rect, pageRect: Rect): RectPercent => {
  return {
    left: `${rect.left / pageRect.width * 100}%`,
    top: `${rect.top / pageRect.height * 100}%`,
    width: `${rect.width / pageRect.width * 100}%`,
    height: `${rect.height / pageRect.height * 100}%`,
  };
}

export const transformToRelativePercentRect = (rect: Rect, pageRect: Rect): RectPercent => {
  return transformToPercentRect(transformToRelativeRect(rect, pageRect), pageRect);
}
