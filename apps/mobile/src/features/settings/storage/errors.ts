export class StorageNotReadyError extends Error {
  readonly code = "STORAGE_PLUGIN_NOT_READY";
  constructor() {
    super("插件尚未就绪");
    this.name = "StorageNotReadyError";
  }
}
