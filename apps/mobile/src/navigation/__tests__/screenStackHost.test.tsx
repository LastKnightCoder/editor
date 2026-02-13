import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ScreenStackHost } from "../ScreenStackHost";
import type { ScreenPageKey, StackEntry } from "../types";

function StatefulInput(props: { label: string }) {
  const [value, setValue] = useState("");
  return (
    <input
      aria-label={props.label}
      value={value}
      onChange={(event) => setValue(event.currentTarget.value)}
    />
  );
}

function emitInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function createScreenEntry<K extends ScreenPageKey>(
  id: string,
  key: K,
  params: StackEntry<K>["params"],
): StackEntry<K> {
  return {
    id,
    key,
    params,
    createdAt: 1,
  };
}

type HostController = {
  render: (screenStack: StackEntry<ScreenPageKey>[], activeId: string) => void;
  cleanup: () => void;
};

function createHostController(): HostController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  return {
    render: (screenStack, activeId) => {
      act(() => {
        root.render(
          <ScreenStackHost
            screenStack={screenStack}
            activeScreenId={activeId}
            renderScreen={(entry) => <StatefulInput label={entry.id} />}
          />,
        );
      });
    },
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("navigation/ScreenStackHost", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("切换 active screen 不应重建已有 screen 实例状态", () => {
    const controller = createHostController();
    const screenStack: StackEntry<ScreenPageKey>[] = [
      createScreenEntry("home-1", "main.home", {}),
      createScreenEntry("search-1", "screen.search", {}),
      createScreenEntry("settings-1", "screen.settings", {}),
    ];

    controller.render(screenStack, "search-1");
    const searchInput = document.querySelector(
      'input[aria-label="search-1"]',
    ) as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();
    emitInputValue(searchInput as HTMLInputElement, "搜索页状态");

    controller.render(screenStack, "settings-1");
    const settingsInput = document.querySelector(
      'input[aria-label="settings-1"]',
    ) as HTMLInputElement | null;
    expect(settingsInput).toBeTruthy();
    emitInputValue(settingsInput as HTMLInputElement, "设置页状态");

    controller.render(screenStack, "search-1");
    const restoredSearchInput = document.querySelector(
      'input[aria-label="search-1"]',
    ) as HTMLInputElement | null;
    const hiddenSettingsContainer = document.querySelector(
      '[data-screen-entry-id="settings-1"]',
    );

    expect(restoredSearchInput?.value).toBe("搜索页状态");
    expect(hiddenSettingsContainer?.getAttribute("data-screen-active")).toBe(
      "false",
    );
    expect(settingsInput?.value).toBe("设置页状态");

    controller.cleanup();
  });

  it("multi screen.contentDetail 实例切换后应分别保留状态", () => {
    const controller = createHostController();
    const screenStack: StackEntry<ScreenPageKey>[] = [
      createScreenEntry("home-1", "main.home", {}),
      createScreenEntry("detail-1", "screen.contentDetail", { contentId: 11 }),
      createScreenEntry("detail-2", "screen.contentDetail", { contentId: 12 }),
    ];

    controller.render(screenStack, "detail-1");
    const detailInput1 = document.querySelector(
      'input[aria-label="detail-1"]',
    ) as HTMLInputElement | null;
    expect(detailInput1).toBeTruthy();
    emitInputValue(detailInput1 as HTMLInputElement, "详情一状态");

    controller.render(screenStack, "detail-2");
    const detailInput2 = document.querySelector(
      'input[aria-label="detail-2"]',
    ) as HTMLInputElement | null;
    expect(detailInput2).toBeTruthy();
    emitInputValue(detailInput2 as HTMLInputElement, "详情二状态");

    controller.render(screenStack, "detail-1");
    const restoredDetailInput1 = document.querySelector(
      'input[aria-label="detail-1"]',
    ) as HTMLInputElement | null;
    const restoredDetailInput2 = document.querySelector(
      'input[aria-label="detail-2"]',
    ) as HTMLInputElement | null;

    expect(restoredDetailInput1?.value).toBe("详情一状态");
    expect(restoredDetailInput2?.value).toBe("详情二状态");

    controller.cleanup();
  });
});
