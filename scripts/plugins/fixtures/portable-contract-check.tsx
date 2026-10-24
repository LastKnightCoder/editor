/* eslint-disable react-refresh/only-export-components -- 此文件验证作者声明，不作为热更新组件入口。 */
import { usePluginEnvironment, type PluginContext, type PluginPageProps } from "@tau/plugins";
import {
  validatePortablePluginManifest,
  readPortablePluginManifest,
  validatePortableDistributionManifest,
  type PortablePluginManifest,
  type ReadablePortablePluginManifest,
} from "@tau/plugins/portable";

export function Page({ context }: PluginPageProps) {
  const environment = usePluginEnvironment();
  return (
    <div>
      {String(environment.input.coarsePointer)}
      {context.environment.platform}
    </div>
  );
}
export function check(context: PluginContext, manifest: PortablePluginManifest) {
  const page = context.pages.register({ id: "sample", title: "示例", component: Page });
  const entry = context.navigation.registerEntry({
    id: "sample",
    title: "示例",
    page,
    params: { n: 1 },
  });
  void entry.dispose();
  validatePortablePluginManifest(manifest);
  validatePortableDistributionManifest(manifest);
  const readable: ReadablePortablePluginManifest = readPortablePluginManifest(manifest);
  const strict: PortablePluginManifest = readable;
  void strict;
  // @ts-expect-error 作者不能改宿主环境。
  context.environment.platform = "ios";
}
