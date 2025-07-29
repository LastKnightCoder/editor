import { invoke, on, off } from "@/electron";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";

function prettyObject(msg: any) {
  const obj = msg;
  if (typeof msg !== "string") {
    msg = JSON.stringify(msg, null, "  ");
  }
  if (msg === "{}") {
    return obj.toString();
  }
  if (msg.startsWith("```json")) {
    return msg;
  }
  return ["```json", msg, "```"].join("\n");
}

type ResponseEvent = {
  id: number;
  payload: {
    request_id: number;
    status?: number;
    chunk?: number[];
  };
};

type StreamResponse = {
  request_id: number;
  status: number;
  status_text: string;
  headers: Record<string, string>;
};

export const streamFetch = async (
  url: string,
  options?: RequestInit,
): Promise<Response> => {
  const {
    signal,
    method = "GET",
    headers: _headers = {},
    body = "",
  } = options || {};

  // eslint-disable-next-line @typescript-eslint/ban-types
  let setRequestId: Function | undefined;
  const requestIdPromise = new Promise((resolve) => (setRequestId = resolve));
  const ts = new TransformStream();
  const writer = ts.writable.getWriter();

  let closed = false;

  const handleResponse = (_e: ResponseEvent, data: any) =>
    requestIdPromise.then((request_id) => {
      const { request_id: rid, chunk, status } = data || {};
      if (request_id != rid) {
        return;
      }
      if (chunk) {
        if (!closed) {
          writer.write(new Uint8Array(chunk));
        }
      } else if (status === 0) {
        close();
      }
    });
  const close = () => {
    if (closed) return;
    off("stream-response", handleResponse);
    closed = true;
    writer.ready.then(() => {
      writer.close().catch((e) => console.error(e));
    });
  };

  const handleAbort = async () => {
    const rid = await requestIdPromise;
    if (rid) {
      try {
        await invoke("stream-fetch-cancel", { requestId: rid });
      } catch (error) {
        console.error("Failed to cancel stream request:", error);
      }
    }
  };

  if (signal) {
    signal.addEventListener("abort", handleAbort);
  }

  // 2. listen response multi times, and write to Response.body
  on("stream-response", handleResponse);

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "User-Agent": navigator.userAgent,
  };
  for (const item of new Headers(_headers || {})) {
    headers[item[0]] = item[1];
  }
  try {
    const res: StreamResponse = await invoke("stream-fetch", {
      method: method.toUpperCase(),
      url,
      headers,
      body,
    });
    const {
      request_id,
      status,
      status_text: statusText,
      headers: resHeaders,
    } = res;
    setRequestId?.(request_id);
    const response = new Response(ts.readable, {
      status,
      statusText,
      headers: resHeaders,
    });
    if (status >= 300) {
      setTimeout(close, 100);
    }
    return response;
  } catch (e) {
    console.error("stream error", e);
    return new Response("", { status: 599 });
  }
};

export function stream(
  chatPath: string,
  requestPayload: object,
  headers: Record<string, string>,
  controller: AbortController,
  parseSSE: (
    text: string,
  ) => { content: string; reasoning_content: string } | undefined,
  options: {
    onFinish: (
      content: string,
      reasoning_content: string,
      res: Response,
    ) => void;
    onError?: (e: Error) => void;
    onUpdate: (full: string, inc: string, reasoningText?: string) => void;
    onReasoning?: (full: string, inc: string) => void;
  },
) {
  let responseText = "";
  let remainText = "";
  let reasoningText = "";
  let reasoningRemainText = "";
  let finished = false;
  let responseRes: Response;

  const flushRemainText = () => {
    responseText += remainText;
    options?.onUpdate?.(responseText, remainText, reasoningText);
    remainText = "";
  };

  const flushReasoningText = () => {
    reasoningText += reasoningRemainText;
    options?.onReasoning?.(reasoningText, reasoningRemainText);
    reasoningRemainText = "";
  };

  // animate response to make it looks smooth
  function animateResponseText() {
    if (finished || controller.signal.aborted) {
      flushReasoningText();
      flushRemainText();
      console.log("[Response Animation] finished");
      if (responseText?.length === 0) {
        options.onError?.(new Error("empty response from server"));
      }
      return;
    }

    if (reasoningRemainText.length > 0) {
      const fetchCount = Math.max(
        1,
        Math.round(reasoningRemainText.length / 60),
      );
      const fetchText = reasoningRemainText.slice(0, fetchCount);
      reasoningText += fetchText;
      reasoningRemainText = reasoningRemainText.slice(fetchCount);
      options.onReasoning?.(reasoningText, fetchText);
    } else if (remainText.length > 0) {
      const fetchCount = Math.max(1, Math.round(remainText.length / 60));
      const fetchText = remainText.slice(0, fetchCount);
      responseText += fetchText;
      remainText = remainText.slice(fetchCount);
      options.onUpdate?.(responseText, fetchText, reasoningText);
    }

    requestAnimationFrame(animateResponseText);
  }

  // start animation
  animateResponseText();

  const finish = () => {
    if (!finished) {
      console.debug("[ChatAPI] end");
      finished = true;
      flushReasoningText();
      flushRemainText();
      options.onFinish(
        responseText + remainText,
        reasoningText + reasoningRemainText,
        responseRes,
      ); // 将res传递给onFinish
    }
  };

  controller.signal.onabort = finish;

  function chatApi(
    chatPath: string,
    headers: Record<string, string>,
    requestPayload: any,
  ) {
    const chatPayload = {
      method: "POST",
      body: requestPayload,
      signal: controller.signal,
      headers,
    };
    const requestTimeoutId = setTimeout(() => controller.abort(), 60 * 1000);
    fetchEventSource(chatPath, {
      fetch: streamFetch as any,
      ...chatPayload,
      async onopen(res) {
        clearTimeout(requestTimeoutId);
        const contentType = res.headers.get("content-type");
        responseRes = res;

        if (contentType?.startsWith("text/plain")) {
          responseText = await res.clone().text();
          return finish();
        }

        if (
          !res.ok ||
          !res.headers
            .get("content-type")
            ?.startsWith(EventStreamContentType) ||
          res.status !== 200
        ) {
          const responseTexts = [responseText];
          let extraInfo = await res.clone().text();
          try {
            const resJson = await res.clone().json();
            extraInfo = prettyObject(resJson);
          } catch (e) {
            console.error("[Request] parse json error", e);
          }

          if (res.status === 401) {
            responseTexts.push("无权限");
          }

          if (extraInfo) {
            responseTexts.push(extraInfo);
          }

          responseText = responseTexts.join("\n\n");

          return finish();
        }
      },
      onmessage(msg) {
        if (msg.data === "[DONE]" || finished) {
          return finish();
        }
        const text = msg.data;
        try {
          const chunk = parseSSE(msg.data);
          if (chunk) {
            const { content, reasoning_content } = chunk;
            if (content) {
              remainText += content;
            }
            if (reasoning_content) {
              reasoningRemainText += reasoning_content;
            }
          }
        } catch (e) {
          console.error("[Request] parse error", text, msg, e);
        }
      },
      onclose() {
        finish();
      },
      onerror(e) {
        options?.onError?.(e);
        throw e;
      },
      openWhenHidden: true,
    });
  }
  console.debug("[ChatAPI] start");
  chatApi(chatPath, headers, requestPayload); // call fetchEventSource
}
