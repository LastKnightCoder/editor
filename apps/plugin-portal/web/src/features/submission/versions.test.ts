import { expect, it, vi } from "vitest";
import { previousRelease, blockingRelease, diffManifest } from "./versions";
import { readPublicationVersions } from "../catalog/queries";
import { createMockApi } from "../../api/mock/mockApi";
import { centerRelease } from "../../../../../../tests/fixtures/plugins/center";

it("提交预检看见格式 3 的最高公开版本，不访问被隔离的 v1 列表", async () => {
  const api = createMockApi({ centerReleases: [centerRelease("3.0.0", "new")] });
  const legacy = vi.spyOn(api, "listReleases");
  const page = await readPublicationVersions(api, "example.counter");
  expect(page.items[0]).toMatchObject({
    id: "new",
    version: "3.0.0",
    manifest: { formatVersion: 3 },
  });
  expect(blockingRelease(page.items, "2.0.0")?.id).toBe("new");
  expect(legacy).not.toHaveBeenCalled();
});

it("泛型上一版本选择保留调用方结构，按语义版本而非数组顺序", () => {
  const center = [
    centerRelease("1.0.0", "one"),
    centerRelease("3.0.0", "three"),
    centerRelease("2.0.0", "two"),
  ];
  expect(previousRelease(center, "3.0.0")?.releaseId).toBe("two");
  expect(
    previousRelease(
      center.map(item => ({ version: item.version, id: item.releaseId })),
      "3.0.0"
    )?.id
  ).toBe("two");
});

it("跨端最低版本由平台矩阵对比，不显示不存在的顶层最低 Tau", () => {
  const next = centerRelease().content.manifest;
  const previous = {
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    platform: "desktop" as const,
    id: next.id,
    name: next.name,
    description: next.description,
    version: "0.9.0",
    minAppVersion: "0.59.0",
    format: "cjs" as const,
    main: "main.js",
    integrity: {},
  };
  expect(diffManifest(previous, next).some(change => change.label === "最低 Tau")).toBe(false);
});
