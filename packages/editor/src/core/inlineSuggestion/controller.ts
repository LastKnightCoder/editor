export interface InlineSuggestionContext {
  readonly before: string;
  readonly after: string;
  readonly language?: string;
}

export interface InlineSuggestionProvider {
  suggest(context: InlineSuggestionContext, signal: AbortSignal): Promise<string | null>;
}

interface Preview<Stamp> {
  readonly stamp: Stamp;
  readonly text: string;
}

export interface InlineSuggestionEditorPort<Stamp> {
  capture(): { context: InlineSuggestionContext; stamp: Stamp } | null;
  isCurrent(stamp: Stamp): boolean;
  tryInsert(stamp: Stamp, text: string): boolean;
}

const IDLE_MS = 400;
const MAX_SUGGESTION_LENGTH = 120;

export function createInlineSuggestionController<Stamp>(
  editor: InlineSuggestionEditorPort<Stamp>,
  provider: InlineSuggestionProvider
) {
  let pending: {
    stamp: Stamp;
    request: AbortController;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let preview: Preview<Stamp> | null = null;
  const listeners = new Set<() => void>();

  const publish = (value: Preview<Stamp> | null) => {
    if (preview === value) return;
    preview = value;
    listeners.forEach(listener => listener());
  };

  const clear = () => {
    const previous = pending;
    pending = null;
    if (previous) {
      clearTimeout(previous.timer);
      previous.request.abort();
    }
    publish(null);
  };

  return {
    getSnapshot: () => preview,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear,
    revalidate() {
      const current = pending ?? preview;
      if (current && !editor.isCurrent(current.stamp)) clear();
    },
    userInput() {
      clear();
      const snapshot = editor.capture();
      if (!snapshot) return;
      const request = new AbortController();
      const timer = setTimeout(async () => {
        try {
          if (!editor.isCurrent(snapshot.stamp)) return;
          const text = await provider.suggest(snapshot.context, request.signal);
          if (
            pending?.request === request &&
            text?.trim() &&
            text.length <= MAX_SUGGESTION_LENGTH &&
            !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(text) &&
            editor.isCurrent(snapshot.stamp)
          ) {
            pending = null;
            publish({ stamp: snapshot.stamp, text });
          }
        } catch {
          // 建议失败时继续普通编辑。
        } finally {
          if (pending?.request === request) pending = null;
        }
      }, IDLE_MS);
      pending = { stamp: snapshot.stamp, request, timer };
    },
    accept() {
      const current = preview;
      if (!current) return false;
      clear();
      return editor.tryInsert(current.stamp, current.text);
    },
    dismiss(current: Preview<Stamp>) {
      if (preview !== current) return false;
      clear();
      return true;
    },
  };
}
