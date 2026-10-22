import { sourceEditorRuntime, inlineSourceRuntime, elementRuntime } from "@tau/editor/source";
import { configureSourceEditor } from "./source-editor";
import { configureInlineSource } from "./inline-source";
import { configureElement } from "./element";

configureSourceEditor(sourceEditorRuntime);
configureInlineSource(inlineSourceRuntime);
configureElement(elementRuntime);
