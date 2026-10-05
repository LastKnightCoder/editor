import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestionChat, QuestionEvent } from "@/types";

const titles = vi.hoisted(() => ({ value: {} as Record<string, string> }));
vi.mock("@/features/chat/openInDock", () => ({
  useChatTitle: () => (sessionId: string) => titles.value[sessionId],
}));

import { Trajectory } from "../components/Trajectory";

const chat = (extra: Partial<QuestionChat> = {}): QuestionChat => ({
  id: 1,
  questionId: 9,
  sessionId: "s1",
  messageIds: [],
  createTime: 1,
  title: "新对话",
  scopeLabel: "",
  messageCount: 2,
  updateTime: 2,
  openable: true,
  missing: false,
  initiated: true,
  ...extra,
});

const events: QuestionEvent[] = [
  { id: 1, questionId: 9, type: "create", payload: {}, createTime: 1 },
  {
    id: 2,
    questionId: 9,
    type: "link",
    payload: { targetType: "chat-session", sessionId: "s1", title: "新对话" },
    createTime: 2,
  },
];

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  titles.value = {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (chats: QuestionChat[], onOpenChat = vi.fn()) =>
  act(() =>
    root.render(
      <Trajectory
        events={events}
        chats={chats}
        now={3}
        onOpenChat={onOpenChat}
        onAddNote={async () => {}}
      />
    )
  );

describe("探究轨迹里的对话", () => {
  it("显示对话的实时标题，点击在侧栏打开", () => {
    titles.value = { s1: "组播地址怎么分配" };
    const onOpenChat = vi.fn();
    const linked = chat();
    render([linked], onOpenChat);
    const ref = container.querySelector<HTMLButtonElement>('button[title="在侧栏打开对话"]');
    expect(ref?.textContent).toBe("组播地址怎么分配");
    act(() => ref!.click());
    expect(onOpenChat).toHaveBeenCalledWith(linked);
  });

  it("对话不在目录里时退回事件里的标题；已删除的不能点", () => {
    render([chat({ missing: true })]);
    expect(container.textContent).toContain("新对话");
    expect(container.querySelector('button[title="在侧栏打开对话"]')).toBeNull();
  });
});
