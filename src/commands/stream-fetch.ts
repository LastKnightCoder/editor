import { invoke, event } from '@tauri-apps/api';
import { EventStreamContentType, fetchEventSource } from "@fortaine/fetch-event-source";

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

export const streamFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  const {
    signal,
    method = "GET",
    headers: _headers = {},
    body = '',
  } = options || {};

  // eslint-disable-next-line @typescript-eslint/ban-types
  let unlisten: Function | undefined;
  // eslint-disable-next-line @typescript-eslint/ban-types
  let setRequestId: Function | undefined;
  const requestIdPromise = new Promise((resolve) => (setRequestId = resolve));
  const ts = new TransformStream();
  const writer = ts.writable.getWriter();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    unlisten && unlisten();
    writer.ready.then(() => {
      writer.close().catch((e) => console.error(e));
    });
  };

  if (signal) {
    signal.addEventListener("abort", () => close());
  }
  // @ts-ignore 2. listen response multi times, and write to Response.body
  event.listen("stream-response", (e: ResponseEvent) =>
    requestIdPromise.then((request_id) => {
      const { request_id: rid, chunk, status } = e?.payload || {};
      if (request_id != rid) {
        return;
      }
      if (chunk) {
        writer.ready.then(() => {
          writer.write(new Uint8Array(chunk));
        });
      } else if (status === 0) {
        close();
      }
    }),
  )
    // eslint-disable-next-line @typescript-eslint/ban-types
  .then((u: Function) => (unlisten = u));

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "User-Agent": navigator.userAgent,
  };
  for (const item of new Headers(_headers || {})) {
    headers[item[0]] = item[1];
  }
  try {
    const res: StreamResponse = await invoke("stream_fetch", {
      method: method.toUpperCase(),
      url,
      headers,
      body:
        typeof body === "string"
          ? Array.from(new TextEncoder().encode(body))
          : [],
    });
    const { request_id, status, status_text: statusText, headers: resHeaders } = res;
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
}

export function stream(
  chatPath: string,
  requestPayload: object,
  headers: Record<string, string>,
  controller: AbortController,
  parseSSE: (text: string) => string | undefined,
  options: {
    onFinish: (text: string, res: Response) => void;
    onError?: (e: Error) => void;
    onUpdate: (text: string, res: string) => void;
  },
) {
  let responseText = "";
  let remainText = "";
  let finished = false;
  let responseRes: Response;

  // animate response to make it looks smooth
  function animateResponseText() {
    if (finished || controller.signal.aborted) {
      responseText += remainText;
      console.log("[Response Animation] finished");
      if (responseText?.length === 0) {
        options.onError?.(new Error("empty response from server"));
      }
      return;
    }

    if (remainText.length > 0) {
      const fetchCount = Math.max(1, Math.round(remainText.length / 60));
      const fetchText = remainText.slice(0, fetchCount);
      responseText += fetchText;
      remainText = remainText.slice(fetchCount);
      options.onUpdate?.(responseText, fetchText);
    }

    requestAnimationFrame(animateResponseText);
  }

  // start animaion
  animateResponseText();

  const finish = () => {
    if (!finished) {
      console.debug("[ChatAPI] end");
      finished = true;
      options.onFinish(responseText + remainText, responseRes); // 将res传递给onFinish
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
      body: JSON.stringify({
        ...requestPayload,
      }),
      signal: controller.signal,
      headers,
    };
    const requestTimeoutId = setTimeout(
      () => controller.abort(),
      60 * 1000,
    );
    fetchEventSource(chatPath, {
      fetch: streamFetch as any,
      ...chatPayload,
      async onopen(res) {
        clearTimeout(requestTimeoutId);
        const contentType = res.headers.get("content-type");
        console.log("[Request] response content type: ", contentType);
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
            responseTexts.push('无权限');
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
          console.log("[Stream]", msg);
          const chunk = parseSSE(msg.data);
          if (chunk) {
            remainText += chunk;
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
