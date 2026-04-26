export interface ThinkTagNormalizedText {
  content: string;
  reasoning_content: string;
}

export interface ThinkTagNormalizer {
  push: (chunk: string) => ThinkTagNormalizedText;
  flush: () => ThinkTagNormalizedText;
  reset: () => void;
}

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

const EMPTY_RESULT: ThinkTagNormalizedText = {
  content: "",
  reasoning_content: "",
};

const getPendingPrefixLength = (text: string, tag: string): number => {
  const maxLength = Math.min(text.length, tag.length - 1);
  for (let len = maxLength; len > 0; len -= 1) {
    if (text.endsWith(tag.slice(0, len))) {
      return len;
    }
  }
  return 0;
};

export const createThinkTagNormalizer = (): ThinkTagNormalizer => {
  let mode: "content" | "reasoning" = "content";
  let pending = "";

  const consume = (chunk: string): ThinkTagNormalizedText => {
    if (!chunk && !pending) {
      return EMPTY_RESULT;
    }

    let rest = `${pending}${chunk}`;
    pending = "";

    let content = "";
    let reasoning = "";

    while (rest.length > 0) {
      if (mode === "content") {
        const openIndex = rest.indexOf(OPEN_TAG);
        if (openIndex >= 0) {
          content += rest.slice(0, openIndex);
          rest = rest.slice(openIndex + OPEN_TAG.length);
          mode = "reasoning";
          continue;
        }

        const pendingLength = getPendingPrefixLength(rest, OPEN_TAG);
        content += rest.slice(0, rest.length - pendingLength);
        pending = rest.slice(rest.length - pendingLength);
        break;
      }

      const closeIndex = rest.indexOf(CLOSE_TAG);
      if (closeIndex >= 0) {
        reasoning += rest.slice(0, closeIndex);
        rest = rest.slice(closeIndex + CLOSE_TAG.length);
        mode = "content";
        continue;
      }

      const pendingLength = getPendingPrefixLength(rest, CLOSE_TAG);
      reasoning += rest.slice(0, rest.length - pendingLength);
      pending = rest.slice(rest.length - pendingLength);
      break;
    }

    return {
      content,
      reasoning_content: reasoning,
    };
  };

  return {
    push: (chunk: string) => consume(chunk),
    flush: () => {
      if (!pending) {
        return EMPTY_RESULT;
      }

      const result =
        mode === "content"
          ? {
              content: pending,
              reasoning_content: "",
            }
          : {
              content: "",
              reasoning_content: pending,
            };
      pending = "";
      return result;
    },
    reset: () => {
      mode = "content";
      pending = "";
    },
  };
};

export const normalizeThinkTaggedText = (
  text: string,
): ThinkTagNormalizedText => {
  const normalizer = createThinkTagNormalizer();
  const first = normalizer.push(text);
  const last = normalizer.flush();
  return {
    content: `${first.content}${last.content}`,
    reasoning_content: `${first.reasoning_content}${last.reasoning_content}`,
  };
};
