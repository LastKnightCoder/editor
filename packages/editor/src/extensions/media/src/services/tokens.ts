import { createServiceId } from "@tau/shared/service-contract";
import type {
  MediaAction,
  MediaInsertSource,
  MediaSelector,
  VideoContentProvider,
} from "./mediaProviders";
import type { EditorSlots } from "./slots";

export const IMediaInsertSources = createServiceId<MediaInsertSource[]>("mediaInsertSources");
export const IVideoContentProviders =
  createServiceId<VideoContentProvider[]>("videoContentProviders");
export const IMediaActions = createServiceId<MediaAction[]>("mediaActions");
export const IMediaSelectors = createServiceId<MediaSelector[]>("mediaSelectors");
export const IEditorSlots = createServiceId<EditorSlots>("editorSlots");
