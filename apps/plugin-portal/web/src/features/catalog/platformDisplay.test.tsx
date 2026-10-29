// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CenterTargets } from "@tau/plugins/center";
import { PlatformBadges } from "./PlatformBadges";
import { PlatformFilter } from "./PlatformFilter";
import { ReleaseAvailability } from "./ReleaseAvailability";
import { TargetMatrix } from "./TargetMatrix";
afterEach(cleanup);

const targets: CenterTargets = {
  desktop: { minAppVersion: "0.60.0" },
  android: {
    minAppVersion: "0.3.0",
  },
};

it("平台筛选单选并报告选择；选中具体平台时说明只是浏览声明", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <PlatformFilter value="all" counts={{ all: 9, android: 3 }} onChange={onChange} />
  );
  const group = screen.getByRole("group", { name: "目标平台" });
  expect(within(group).getAllByRole("button")).toHaveLength(4);
  expect(screen.getByRole("button", { name: /全部平台/ }).getAttribute("aria-pressed")).toBe(
    "true"
  );
  expect(screen.queryByText(/以 Tau 应用内的插件中心为准/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Android/ }));
  expect(onChange).toHaveBeenCalledWith("android");
  rerender(<PlatformFilter value="android" onChange={onChange} />);
  expect(screen.getByText(/仅显示声明支持Android的插件/)).toBeTruthy();
});

it("平台标识按固定顺序列出声明平台，旧格式标为仅桌面", () => {
  const ios = { minAppVersion: "0.3.0" };
  const { rerender } = render(
    <PlatformBadges version={{ formatVersion: 3, targets: { ios, android: ios } }} />
  );
  expect(screen.getByRole("list", { name: "支持平台：Android、iOS" })).toBeTruthy();
  rerender(<PlatformBadges version={{ formatVersion: 1, targets: { desktop: ios } }} />);
  const list = screen.getByRole("list", { name: "支持平台：桌面（仅桌面）" });
  expect(
    within(list)
      .getAllByRole("listitem")
      .map(item => item.textContent)
  ).toEqual(["桌面", "仅桌面"]);
});

it("目标矩阵逐平台展示最低版本，未声明平台显示不支持", () => {
  render(<TargetMatrix targets={targets} highlight="android" />);
  const android = screen.getByRole("region", { name: "Android目标" });
  expect(within(android).getByText("0.3.0")).toBeTruthy();
  expect(within(android).queryByText("必需能力")).toBeNull();
  const desktop = screen.getByRole("region", { name: "桌面目标" });
  expect(within(desktop).queryByText("节点等级")).toBeNull();
  const ios = screen.getByRole("region", { name: "iOS目标" });
  expect(within(ios).getByText("未声明")).toBeTruthy();
  expect(within(ios).getByText(/此版本不支持iOS/)).toBeTruthy();
});

it("网页未核验时不宣称可安装，并说明下载 ZIP 不等于安装", () => {
  render(
    <ReleaseAvailability
      latest={{ version: "1.2.0" }}
      compatible={null}
      compatibility={{ status: "unchecked", reasons: [] }}
    />
  );
  expect(screen.getByRole("note").textContent).toMatch(/网页无法确认你的设备能否安装/);
  expect(screen.getByRole("note").textContent).toMatch(/不会装到手机/);
  expect(screen.queryByText(/可安装 v/)).toBeNull();
});

it("可安装版本低于最新版本时同时列出二者，不回退到 latest", () => {
  render(
    <ReleaseAvailability
      latest={{ version: "2.0.0" }}
      compatible={{ version: "1.4.0" }}
      compatibility={{ status: "compatible", reasons: [] }}
    />
  );
  expect(screen.getByText("可安装 v1.4.0")).toBeTruthy();
  expect(screen.getByText(/最新版本 v2.0.0 暂不适用于此设备/)).toBeTruthy();
  expect(screen.queryByText(/部分功能不可用/)).toBeNull();
});

it("无兼容版本时逐条列出结构化原因及所需版本", () => {
  render(
    <ReleaseAvailability
      latest={{ version: "2.0.0" }}
      compatible={null}
      compatibility={{
        status: "incompatible",
        reasons: [
          { code: "APP_VERSION_TOO_LOW", minAppVersion: "0.4.0" },
          { code: "PLATFORM_UNSUPPORTED", platform: "ios" },
          { code: "DISTRIBUTION_UNAVAILABLE" },
        ],
      }}
    />
  );
  const list = screen.getByRole("list", { name: "不可安装原因" });
  const items = within(list)
    .getAllByRole("listitem")
    .map(item => item.textContent);
  expect(items).toEqual([
    "需要 Tau 0.4.0 或更高版本",
    "该版本未声明iOS",
    "该平台的插件分发尚未开放",
  ]);
});
