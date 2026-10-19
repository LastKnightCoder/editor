import { definePlugin, type PluginServices } from "@tau/plugins";
import { PluginHost, createMemoryStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { Button, Input, Select, Switch } from "@tau/ui";
import { rendererPublishRegistry } from "../../src/app/plugins/publish-registry";
import { connectPublishRenderer } from "../../src/app/plugins/publish-bridge";
import { desktopFetch } from "../../src/commands/fetch";
import { publishGitSnapshot, selectGitCacheDirectory } from "../../src/commands/publish-git";

async function start() {
  const artifacts =
    await window.electron.invoke<DevelopmentPluginPackage[]>("publish-test:artifacts");
  const host = new PluginHost({
    workspaceId: "isolated",
    storage: createMemoryStorage(),
    publish: rendererPublishRegistry,
    fetch: desktopFetch,
    services: {
      git: { publishSnapshot: publishGitSnapshot, selectCacheDirectory: selectGitCacheDirectory },
    } as unknown as PluginServices,
    settings: {
      register: (_context, definition) => ({
        id: definition.id,
        open: async () => {},
        dispose() {},
      }),
    },
  });
  for (const artifact of artifacts) {
    host.registerTrusted(
      evaluatePluginPackage(artifact, {
        "@tau/plugins": { definePlugin },
        "@tau/ui": { Button, Input, Select, Switch },
        react: React,
        "react/jsx-runtime": jsx,
      })
    );
    await host.enable(artifact.manifest.id);
  }
  const disconnect = connectPublishRenderer();
  Object.assign(window, {
    publishTest: {
      disable: (id: string) => host.disable(id),
      disconnect,
      available: () => rendererPublishRegistry.list(),
    },
  });
  await window.electron.invoke("publish-test:ready");
}
void start().catch(error => {
  void window.electron.invoke("publish-test:failed", String(error));
});
