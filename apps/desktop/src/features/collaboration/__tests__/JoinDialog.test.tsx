import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JoinDialog } from "../components/JoinDialog";

const mocks = vi.hoisted(() => ({ join: vi.fn() }));
vi.mock("@/commands", () => ({ joinCollaboration: mocks.join }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  mocks.join.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const segments = () => [
  ...document.querySelectorAll<HTMLInputElement>('input[aria-label^="协作码第"]'),
];
const submitButton = () =>
  [...document.querySelectorAll("button")].find(b => b.textContent?.includes("申请加入"))!;

function paste(input: HTMLInputElement, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
    clipboardData: { getData: () => string };
  };
  event.clipboardData = { getData: () => text };
  input.dispatchEvent(event);
}

it("粘贴整段协作码自动分三段，满 12 位才可提交", async () => {
  mocks.join.mockResolvedValue(undefined);
  await act(async () => root.render(<JoinDialog open onOpenChange={() => {}} nickname="小熊" />));
  expect(submitButton().disabled).toBe(true);

  await act(async () => paste(segments()[0], " k7qx-m3az 9bcd "));
  expect(segments().map(i => i.value)).toEqual(["K7QX", "M3AZ", "9BCD"]);
  expect(submitButton().disabled).toBe(false);

  await act(async () => submitButton().click());
  expect(mocks.join).toHaveBeenCalledWith("K7QXM3AZ9BCD");
  expect(document.body.textContent).toContain("申请已发出");
});

it("提交失败时原位显示错误，保留已输入的码", async () => {
  mocks.join.mockRejectedValue(new Error("协作码无效或已过期"));
  await act(async () => root.render(<JoinDialog open onOpenChange={() => {}} nickname="小熊" />));
  await act(async () => paste(segments()[0], "AAAAAAAAAAAA"));
  await act(async () => submitButton().click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("协作码无效或已过期");
  expect(segments().map(i => i.value)).toEqual(["AAAA", "AAAA", "AAAA"]);
});
