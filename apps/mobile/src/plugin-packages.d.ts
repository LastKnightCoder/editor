declare module "virtual:tau-editor-plugins" {
  const loaders: Array<() => Promise<import("@tau/plugins/content").CompiledPluginPackage>>;
  export default loaders;
}
