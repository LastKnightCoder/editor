// 屏幕区域左偏移：中等与宽档左侧导航条占用的宽度。
// 唯一写入方：同时写 CSS 变量 --screen-inset-left（页面层、浮层定位消费）
// 与模块值（边缘返回、tab 滑切的起点与跟手宽度消费），两处不会漂移。

let insetLeft = 0;

export function setScreenInsetLeft(px: number): void {
  insetLeft = Math.max(0, px);
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--screen-inset-left", `${insetLeft}px`);
  }
}

export function getScreenInsetLeft(): number {
  return insetLeft;
}
