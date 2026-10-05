/**
 * AI 对话页 ⇄ 右侧停靠栏的形变过渡（View Transitions API）。
 *
 * 两处对话容器挂同一个 view-transition-name（ASSIST_MORPH_CLASS），切换时浏览器把旧容器
 * 的位置尺寸补间到新容器；同一时刻只能有一处带名字（停靠栏仅在可见时挂名，对话页不在
 * 栈顶时 display:none 不参与捕获）。转场经 page/morph 统一运行（根上 data-morph），
 * 停靠栏据此关掉自身的滑入滑出，让新状态一步到位供浏览器截图。
 */

import { startPageTransition } from "@/page/morph";

export const ASSIST_MORPH_CLASS = "[view-transition-name:assist-chat]";

export function morphAssist(update: () => void) {
  startPageTransition(update);
}
