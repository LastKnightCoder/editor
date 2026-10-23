// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CenterTargets } from "@tau/plugins/center";
import { UiProvider } from "@tau/ui";
import { PlatformEvidence, type PlatformEvidenceValue } from "./PlatformEvidence";
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

function EvidenceHarness({ onChange }: { onChange: (value: PlatformEvidenceValue) => void }) {
  const [value, setValue] = useState<PlatformEvidenceValue>({});
  return (
    <PlatformEvidence
      platforms={["ios", "desktop"]}
      value={value}
      onChange={(platform, draft) => {
        const next = { ...value, [platform]: draft };
        setValue(next);
        onChange(next);
      }}
    />
  );
}

it("证据只列声明平台，勾选与说明逐平台受控并更新进度", () => {
  const onChange = vi.fn();
  render(
    <UiProvider>
      <EvidenceHarness onChange={onChange} />
    </UiProvider>
  );
  expect(
    screen.getAllByRole("group").map(group => group.querySelector("legend")?.textContent)
  ).toEqual(["桌面", "iOS"]);
  expect(screen.getByText("已验证 0/2")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "已在iOS上验证此版本" }));
  fireEvent.change(screen.getByRole("textbox", { name: "iOS验证说明" }), {
    target: { value: "iPhone 15 / iOS 26.3" },
  });
  expect(screen.getByText("已验证 1/2")).toBeTruthy();
  expect(onChange).toHaveBeenLastCalledWith({
    ios: { verified: true, note: "iPhone 15 / iOS 26.3" },
  });
});

it("冲突可载入最新，失败显示原因；只读模式不提供输入", () => {
  const onReload = vi.fn();
  render(
    <UiProvider>
      <PlatformEvidence
        platforms={["android"]}
        value={{ android: { verified: true, note: "Pixel 9" } }}
        readOnly
        error="网络中断"
        conflict={{ message: "其他审核者已更新证据。", onReload }}
      />
    </UiProvider>
  );
  expect(screen.getByRole("alert").textContent).toMatch(/网络中断/);
  fireEvent.click(screen.getByRole("button", { name: "载入最新" }));
  expect(onReload).toHaveBeenCalled();
  const group = screen.getByRole("group");
  expect(within(group).getByText("已验证")).toBeTruthy();
  expect(within(group).getByText("Pixel 9")).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
});
