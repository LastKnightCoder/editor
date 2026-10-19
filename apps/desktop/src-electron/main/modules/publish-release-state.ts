import { posix } from "node:path";
import { assertPublishPath } from "@tau/plugins/template";
import type {
  IPublishFile,
  IPublishHistory,
  IPublishPlan,
  PublishedRelease,
  PublishReleaseState as ReleaseState,
  PublishFileDescriptor,
} from "@/types/publish";
export type { PublishReleaseState as ReleaseState } from "@/types/publish";

export function describeRelease(files: IPublishFile[]): PublishedRelease {
  const release: PublishedRelease = {
    hashes: Object.create(null),
    data: Object.create(null),
    shared: [],
    assets: [],
    templates: [],
  };
  const paths = new Set(files.map(file => file.path));
  for (const file of files.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    release.hashes[file.path] = file.hash;
    if (file.templateIdentity) release.templates.push(file.templateIdentity);
    if (file.path.startsWith("data/") && file.path.endsWith(".json")) {
      const value = JSON.parse(file.content.toString());
      if (value.key) {
        const dependencies: string[] = [];
        const resource = (relative: string) => {
          const path = posix.normalize(posix.join(posix.dirname(file.path), relative));
          if (!paths.has(path)) throw new Error(`发布依赖缺失：${path}`);
          dependencies.push(path);
        };
        for (const style of value.contentStyles ?? []) resource(style.href);
        for (const plugin of value.pluginRenderers ?? []) {
          resource(plugin.entry);
          if (plugin.styles) resource(plugin.styles);
        }
        release.data[value.key] = { type: value.meta.type, path: file.path, dependencies };
      } else release.shared.push(file.path);
    } else if (!file.publicationEntry && !/^(?:data|plugin-assets)\//.test(file.path))
      release.assets.push(file.path);
  }
  return release;
}

/** 只保留前一次成功发布中仍可共存的依赖；撤下优先于缓存保留。 */
type History = Pick<IPublishHistory, "filePath" | "contentHash">;
type Plan<T> = Omit<IPublishPlan, "toUpload"> & { toUpload: T[] };
export function planPublication(
  files: IPublishFile[],
  history: History[],
  state?: ReleaseState
): IPublishPlan;
export function planPublication(
  files: PublishFileDescriptor[],
  history: History[],
  state: ReleaseState | undefined,
  release: PublishedRelease
): Plan<PublishFileDescriptor>;
export function planPublication(
  files: PublishFileDescriptor[],
  history: History[],
  state?: ReleaseState,
  release?: PublishedRelease
): Plan<PublishFileDescriptor> {
  for (const file of files) assertPublishPath(file.path);
  for (const file of history) assertPublishPath(file.filePath);
  const current =
    release ??
    describeRelease(
      files.map(file => {
        if (
          !("content" in file) ||
          !(typeof file.content === "string" || Buffer.isBuffer(file.content))
        )
          throw new Error("发布计划缺少文件内容或资源描述");
        return { ...file, content: file.content };
      })
    );
  const changed = !state || JSON.stringify(current.hashes) !== JSON.stringify(state.current.hashes);
  const previous = changed ? state?.current : state?.previous;
  const retained = new Set(Object.keys(current.hashes));
  if (previous) {
    for (const path of [...previous.shared, ...previous.assets]) assertPublishPath(path);
    const withdrawn = Object.keys(previous.data).some(key => !current.data[key]);
    for (const [key, item] of Object.entries(previous.data)) {
      if (withdrawn || !current.data[key]) continue;
      assertPublishPath(item.path);
      item.dependencies.forEach(path => assertPublishPath(path));
      retained.add(item.path);
      item.dependencies.forEach(path => retained.add(path));
    }
    if (!withdrawn) previous.shared.forEach(path => retained.add(path));
    previous.assets.forEach(path => retained.add(path));
  }
  const hashes = new Map(history.map(item => [item.filePath, item.contentHash]));
  return {
    toUpload: files.filter(file => hashes.get(file.path) !== file.hash),
    unchanged: files.filter(file => hashes.get(file.path) === file.hash).map(file => file.path),
    toDelete: history.filter(item => !retained.has(item.filePath)).map(item => item.filePath),
    releaseState: {
      version: 1,
      current,
      ...(previous ? { previous } : {}),
      published: {
        ...Object.fromEntries(
          history
            .filter(item => retained.has(item.filePath))
            .map(item => [item.filePath, item.contentHash])
        ),
        ...current.hashes,
      },
      pending: Object.fromEntries(
        history
          .filter(item => !retained.has(item.filePath))
          .map(item => [item.filePath, item.contentHash])
      ),
    },
  };
}
