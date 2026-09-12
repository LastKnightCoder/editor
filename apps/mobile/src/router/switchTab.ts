// Tab 切换语义：目标页在栈内则回到它（popTo），否则压入。
// 根 Tab（home/cardsLibrary/diaryHome/settings）均 match: "single"，栈内至多一个实例。

import type { Navigator } from "./navigatorTypes";

export function switchTabScreen(navigator: Navigator, key: string): void {
  const entries = navigator.getScreenStack().entries;
  const topKey = entries[entries.length - 1]?.key;
  if (key === topKey) return;
  if (entries.some(entry => entry.key === key)) {
    navigator.popTo(key);
  } else {
    navigator.push(key);
  }
}
