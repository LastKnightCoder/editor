// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { sampleSubmission } from "../../api/mock/samples";
import { VersionDiff } from "./VersionDiff";

const queries = vi.hoisted(() => ({
  center: vi.fn(() => ({
    data: { pages: [{ items: [] }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
  })),
  legacy: vi.fn(() => ({ data: { items: [] }, isPending: false, isError: false })),
}));
vi.mock("../catalog/center-queries", () => ({ useCenterVersions: queries.center }));
vi.mock("../catalog/queries", () => ({ usePluginReleases: queries.legacy }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("跨端独立Skill的版本比较走v2与平台声明，旧desktop独立包继续走原通道", () => {
  const identity = {
    id: "test.skill",
    name: "写作",
    description: "说明",
    version: "1.0.0",
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    skills: ["writing"],
    integrity: { "skills/writing/SKILL.md": "a".repeat(64) },
  };
  const submission = sampleSubmission();
  const { rerender } = render(
    <VersionDiff
      submission={submission}
      manifest={{
        ...identity,
        platform: "portable",
        targets: { android: { minAppVersion: "0.2.13" } },
      }}
    />
  );
  expect(queries.center).toHaveBeenCalledWith("test.skill", "all");
  expect(queries.legacy).not.toHaveBeenCalled();
  expect(screen.getByText("平台声明变化")).toBeTruthy();
  rerender(
    <VersionDiff
      submission={submission}
      manifest={{ ...identity, platform: "desktop", minAppVersion: "0.59.0" }}
    />
  );
  expect(queries.legacy).toHaveBeenCalledWith("test.skill");
});
