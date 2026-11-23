import type { TransferSource } from "../content-transfer/source";
export function importSourceFixture(
  files: Record<string, string>,
  markers: string[] = [],
  kind: TransferSource["kind"] = "folder"
): TransferSource {
  const snapshots = new Map<string, string>();
  return {
    kind,
    name: "vault",
    rootPath: "/vault",
    session: "fixture",
    close: async () => {},
    files: Object.keys(files),
    markers,
    has: path => Object.hasOwn(files, path),
    readText: async path => files[path],
    snapshots: {
      save: async (path, body) => {
        snapshots.set(path, body);
      },
      load: async path => {
        const body = snapshots.get(path);
        if (body === undefined) throw new Error(path);
        return body;
      },
    },
  };
}
