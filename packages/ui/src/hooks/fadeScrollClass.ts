/**
 * 面板内纵向滚动区类名（桌面端 FadeScroll、Drawer 正文共用）：edge fade 协议 + 内缩滚动条（4px 细条 + 右侧 6px 透明边 +
 * 轨道上下各 10px，不贴容器边缘）。滚动容器由第三方组件渲染、无法包 <FadeScroll> 时，
 * 直接挂此类名并对容器调用 useEdgeFade。右侧 6px 透明边算在宽度里，调用方右内边距相应减 6px。
 * 不用 .scrollbar-inset：它是未分层 CSS，其 4px 轨道边会压过这里的工具类。
 * 轨道内缩用 margin 而非透明 border：Chromium 的滑块会画进轨道 border，滚到顶/底仍贴边
 */
export const FADE_SCROLL_CLASS =
  "edge-fade-scroll overflow-y-auto border-r-[6px] border-r-transparent " +
  "[&::-webkit-scrollbar-thumb]:rounded-[2px] [&::-webkit-scrollbar]:w-1 " +
  "[&::-webkit-scrollbar-track]:my-2.5";
