export {
  createServiceId,
  IResourceService,
  IFileService,
  ICompilerService,
  IOpenerService,
  IThemeService,
  IExtensionErrorReporter,
  IEditorNotifier,
  IMediaInsertSources,
  IVideoContentProviders,
  IMediaActions,
  IMediaSelectors,
  IEditorSlots,
} from "./tokens";
export type { ServiceIdentifier } from "./tokens";

export { createServiceRegistry, createChildRegistry } from "./registry";
export type { ServiceRegistry, ServiceRegister, ServiceRegistration } from "./registry";

export {
  useServiceRegistry,
  useService,
  useOptionalService,
  useEditorSlots,
  useNotifier,
} from "./hooks";
export { notifierOf } from "./editorNotifier";
export { defaultEditorNotifier } from "./notifier";
export type {
  EditorNotifier,
  EditorFeedback,
  EditorLoadingHandle,
  EditorConfirmOptions,
} from "./notifier";

export { createDefaultEditorSlots } from "./defaultSlots";

export { consoleErrorReporter } from "./errorReporter";
export type { ExtensionErrorEvent, ExtensionErrorReporter } from "./errorReporter";

export type {
  MediaType,
  MediaInsertPayload,
  MediaInsertSource,
  VideoContentProvider,
  MediaAction,
  MediaSelector,
  SelectedMedia,
} from "./mediaProviders";

export type { EditorSlots, ImageSlotProps, VideoSlotProps, AudioSlotProps } from "./slots";
