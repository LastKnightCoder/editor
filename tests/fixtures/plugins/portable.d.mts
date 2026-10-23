export function portableFixtures(): Promise<
  {
    manifest: import("../../../packages/plugins/src/portable").PortablePluginManifest;
    code: string;
    css?: string;
  }[]
>;
