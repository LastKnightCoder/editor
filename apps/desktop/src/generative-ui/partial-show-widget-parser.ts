export interface PartialShowWidgetArgs {
  title?: string;
  loadingMessages: string[];
  widgetCode?: string;
  iHaveSeenReadMe?: boolean;
  isLikelyComplete: boolean;
}

interface ParsedStringFragment {
  value: string;
  nextIndex: number;
  closed: boolean;
}

const skipWhitespace = (input: string, start: number): number => {
  let index = start;
  while (index < input.length && /\s/.test(input[index])) {
    index += 1;
  }
  return index;
};

const parseUnicodeEscape = (input: string, start: number) => {
  const code = input.slice(start, start + 4);
  if (/^[0-9a-fA-F]{4}$/.test(code)) {
    return {
      char: String.fromCharCode(Number.parseInt(code, 16)),
      consumed: 4,
    };
  }
  return {
    char: `u${code}`,
    consumed: Math.min(4, code.length),
  };
};

const parseJsonStringFragment = (
  input: string,
  start: number,
): ParsedStringFragment | null => {
  if (input[start] !== '"') {
    return null;
  }

  let index = start + 1;
  let value = "";

  while (index < input.length) {
    const char = input[index];
    if (char === '"') {
      return {
        value,
        nextIndex: index + 1,
        closed: true,
      };
    }
    if (char === "\\") {
      const nextChar = input[index + 1];
      if (nextChar == null) {
        return {
          value,
          nextIndex: input.length,
          closed: false,
        };
      }
      switch (nextChar) {
        case '"':
        case "\\":
        case "/":
          value += nextChar;
          index += 2;
          continue;
        case "b":
          value += "\b";
          index += 2;
          continue;
        case "f":
          value += "\f";
          index += 2;
          continue;
        case "n":
          value += "\n";
          index += 2;
          continue;
        case "r":
          value += "\r";
          index += 2;
          continue;
        case "t":
          value += "\t";
          index += 2;
          continue;
        case "u": {
          const parsed = parseUnicodeEscape(input, index + 2);
          value += parsed.char;
          index += 2 + parsed.consumed;
          continue;
        }
        default:
          value += nextChar;
          index += 2;
          continue;
      }
    }
    value += char;
    index += 1;
  }

  return {
    value,
    nextIndex: input.length,
    closed: false,
  };
};

const parseStringArrayFragment = (
  input: string,
  start: number,
): { values: string[]; nextIndex: number; closed: boolean } | null => {
  if (input[start] !== "[") {
    return null;
  }

  let index = start + 1;
  const values: string[] = [];
  let closed = false;

  while (index < input.length) {
    index = skipWhitespace(input, index);
    if (input[index] === "]") {
      closed = true;
      index += 1;
      break;
    }
    const parsedString = parseJsonStringFragment(input, index);
    if (!parsedString) {
      break;
    }
    values.push(parsedString.value);
    index = skipWhitespace(input, parsedString.nextIndex);
    if (!parsedString.closed) {
      break;
    }
    if (input[index] === ",") {
      index += 1;
      continue;
    }
    if (input[index] === "]") {
      closed = true;
      index += 1;
      break;
    }
    break;
  }

  return {
    values,
    nextIndex: index,
    closed,
  };
};

const parseBooleanFragment = (
  input: string,
  start: number,
): { value: boolean; nextIndex: number; closed: boolean } | null => {
  if (input.startsWith("true", start)) {
    return {
      value: true,
      nextIndex: start + 4,
      closed: true,
    };
  }
  if (input.startsWith("false", start)) {
    return {
      value: false,
      nextIndex: start + 5,
      closed: true,
    };
  }
  return null;
};

export function extractPartialShowWidgetArgs(
  raw: string,
): PartialShowWidgetArgs {
  const result: PartialShowWidgetArgs = {
    loadingMessages: [],
    isLikelyComplete: false,
  };

  let index = raw.indexOf("{");
  if (index < 0) {
    return result;
  }

  index += 1;
  let braceDepth = 1;

  while (index < raw.length) {
    index = skipWhitespace(raw, index);
    if (index >= raw.length) {
      break;
    }

    if (raw[index] === "}") {
      braceDepth -= 1;
      index += 1;
      if (braceDepth === 0) {
        result.isLikelyComplete = true;
        break;
      }
      continue;
    }

    const parsedKey = parseJsonStringFragment(raw, index);
    if (!parsedKey) {
      break;
    }
    index = skipWhitespace(raw, parsedKey.nextIndex);
    if (raw[index] !== ":") {
      break;
    }
    index = skipWhitespace(raw, index + 1);

    switch (parsedKey.value) {
      case "title": {
        const parsedTitle = parseJsonStringFragment(raw, index);
        if (!parsedTitle) {
          break;
        }
        result.title = parsedTitle.value;
        index = parsedTitle.nextIndex;
        break;
      }
      case "widget_code": {
        const parsedWidgetCode = parseJsonStringFragment(raw, index);
        if (!parsedWidgetCode) {
          break;
        }
        result.widgetCode = parsedWidgetCode.value;
        index = parsedWidgetCode.nextIndex;
        break;
      }
      case "loading_messages": {
        const parsedArray = parseStringArrayFragment(raw, index);
        if (!parsedArray) {
          break;
        }
        result.loadingMessages = parsedArray.values;
        index = parsedArray.nextIndex;
        break;
      }
      case "i_have_seen_read_me": {
        const parsedBoolean = parseBooleanFragment(raw, index);
        if (!parsedBoolean) {
          break;
        }
        result.iHaveSeenReadMe = parsedBoolean.value;
        index = parsedBoolean.nextIndex;
        break;
      }
      default: {
        // 仅解析关心的字段。跳过未知字段时保持保守退出，避免误解析顶层大段 HTML。
        return result;
      }
    }

    index = skipWhitespace(raw, index);
    if (raw[index] === ",") {
      index += 1;
    }
  }

  return result;
}
