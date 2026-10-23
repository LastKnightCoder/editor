// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CenterTargets } from "@tau/plugins/center";
import { TargetsDiff } from "./TargetsDiff";
import { diffTargets } from "./targetChanges";
afterEach(cleanup);

type Targets = CenterTargets;
const previous: Targets = {
  desktop: { minAppVersion: "0.60.0", required: ["pages.v1"], optional: [] },
  ios: {
    minAppVersion: "0.3.0",
    required: ["pages.v1", "editor.elements.v1"],
    optional: [],
    elements: { counter: "render" },
  },
};
const current: Targets = {
  desktop: { minAppVersion: "0.60.0", required: ["pages.v1"], optional: [] },
  android: { minAppVersion: "0.3.0", required: ["pages.v1"], optional: [] },
  ios: {
    minAppVersion: "0.4.0",
    required: ["pages.v1", "editor.elements.v1"],
    optional: ["ui.dialog.v1"],
    elements: { counter: "edit" },
  },
};

it("逐平台计算新增平台、最低版本、能力与节点等级变化，未变平台不列出", () => {
  expect(diffTargets(previous, current)).toEqual([
    { platform: "android", kind: "added", lines: ["最低 Tau 0.3.0"] },
    {
      platform: "ios",
      kind: "changed",
      lines: ["最低 Tau 0.3.0 → 0.4.0", "可选能力新增 对话框", "节点 counter：仅展示 → 可编辑"],
    },
  ]);
  expect(diffTargets(current, { desktop: current.desktop })).toEqual([
    { platform: "android", kind: "removed", lines: [] },
    { platform: "ios", kind: "removed", lines: [] },
  ]);
});

it("上一版没有跨端声明时提示逐个核对，且没有可编辑的声明输入", () => {
  render(<TargetsDiff previous={null} current={current} previousVersion="1.0.0" />);
  expect(screen.getByText(/上一版 v1.0.0 不含跨端平台声明/)).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
});
