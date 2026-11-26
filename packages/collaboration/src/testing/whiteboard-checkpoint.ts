import type { WhiteboardModel } from "../whiteboard-model";
/** 大量换序后留下的旧位置，选定位置和页面内容保持原样。 */
export function seedRoomOrderHistory(model: WhiteboardModel, pageId: string) {
  model.pageOrder.push(
    Array.from({ length: 35000 }, (_, i) => ({
      id: pageId,
      token: "old-" + i + "-" + "p".repeat(92),
    }))
  );
}
