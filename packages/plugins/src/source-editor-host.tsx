import { sourceEditorRuntime, inlineSourceRuntime } from "@tau/editor/source";
import { configureSourceEditor } from "./source-editor";
import { configureInlineSource } from "./inline-source";

configureSourceEditor(sourceEditorRuntime);
configureInlineSource(inlineSourceRuntime);
