export interface TextFieldSnapshot {
  readonly value: string;
  readonly revision: string;
}

export interface TextFieldDelta {
  retain?: number;
  delete?: number;
  insert?: string;
}

export interface EditorTextField {
  getSnapshot(): TextFieldSnapshot;
  subscribe(
    listener: (event: { delta: readonly TextFieldDelta[]; local: boolean }) => void
  ): () => void;
  edit(change: { offset: number; remove: number; text: string; revision: string }): void;
  editBatch(
    changes: readonly { offset: number; remove: number; text: string }[],
    revision: string
  ): void;
  /** 本机观察版本保护；共享文档的异步整段替换须经宿主条件提交，不能据此声称服务端 CAS。 */
  replace(value: string, revision: string): void;
  undo(): void;
  redo(): void;
  /** 宿主输入适配器登记尚未提交的组合输入，不属于插件业务状态。 */
  preserveDraft?(snapshot: TextFieldSnapshot): void;
  registerInput?(flush: () => void): () => void;
  flushInputs?(): void;
  dispose(): void;
}
