export * from "./card";
export * from "./article";
export * from "./document";
export * from "./time_record";
export * from "./project";
export * from "./pdf";
export * from "./white-board";
export * from "./voice-copy";
export * from "./llm";
export * from "./chat-message";
export * from "./vec-document";
export * from "./operation";
export * from "./statistic";
export * from "./search";
export * from "./video-note";
export * from "./question";
export * from "./content";
export * from "./goal";
export * from "./data-table";
export * from "./todo";
export * from "./rpc";
export * from "./shortcut";
export * from "./pomodoro";

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
