import { describe, expect, it } from "vitest";
import { resolveRemoteSyncRequirement } from "../sharedContentSync";

describe("resolveRemoteSyncRequirement", () => {
  it("本地与远端内容一致时无需同步", () => {
    expect(
      resolveRemoteSyncRequirement({
        remoteUpdateTime: 300,
        lastSyncedContentUpdateTime: null,
        localContentUpdatedAt: 200,
        contentMatchesRemote: true,
      })
    ).toBe("none");
  });

  it("远端变更且本地自上次同步后未修改时，自动拉取远端", () => {
    expect(
      resolveRemoteSyncRequirement({
        remoteUpdateTime: 300,
        lastSyncedContentUpdateTime: 200,
        localContentUpdatedAt: 200,
        contentMatchesRemote: false,
      })
    ).toBe("pull-remote");
  });

  it("缺少同步基线且内容不一致时，需要用户确认", () => {
    expect(
      resolveRemoteSyncRequirement({
        remoteUpdateTime: 300,
        lastSyncedContentUpdateTime: null,
        localContentUpdatedAt: 250,
        contentMatchesRemote: false,
      })
    ).toBe("confirm-sync");
  });

  it("本地与远端都在上次同步后变化时，需要用户确认", () => {
    expect(
      resolveRemoteSyncRequirement({
        remoteUpdateTime: 400,
        lastSyncedContentUpdateTime: 200,
        localContentUpdatedAt: 350,
        contentMatchesRemote: false,
      })
    ).toBe("confirm-sync");
  });
});
