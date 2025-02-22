import { nodeFetch } from "@/commands";
import { Message } from "@/types";
import { CONVERT_PROMPT, Role, SPLIT_PROMPT, WEB_CLIP_PROMPT } from "@/constants";
import { chatLLM } from "@/hooks/useChatLLM.ts";
import { Descendant } from "slate";

interface WebClipOptions {
  directFromHTML?: boolean;
  split?: boolean;
  controller?: AbortController;
}

interface WebClipResult {
  result: boolean;
  error?: string;
  value?: Descendant[];
}

export const webClipFromUrl = async (url: string, options: WebClipOptions): Promise<WebClipResult> => {
  const { split, controller, directFromHTML } = options;

  const res = await nodeFetch(url, {
    method: "GET"
  });

  const text = res as string;
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  // 移除所有的 scripts
  doc.querySelectorAll('script').forEach(script => script.remove());
  const pageContent = doc.getElementById('page-content');
  console.log('pageContent', pageContent)
  const html = doc.getElementById('page-content')?.innerHTML || doc.body.innerHTML;

  if (controller && controller.signal.aborted) {
    return {
      result: false,
      error: "aborted"
    };
  }

  if (directFromHTML) {
    const messages: Message[] = [{
      role: Role.System,
      content: WEB_CLIP_PROMPT
    }, {
      role: Role.User,
      content: html
    }];

    try {
      let aiRes = await chatLLM(messages);
      if (aiRes) {
        aiRes = aiRes.trim();
        if (aiRes.startsWith("```json") && aiRes.endsWith("```")) {
          aiRes = aiRes.slice(7, -3);
        }
      }
      console.log('aiRes', aiRes);
      try {
        return {
          result: true,
          value: JSON.parse(aiRes || '[]')
        };
      } catch (e) {
        return {
          result: false,
          error: "parse error"
        };
      }
    } catch (e) {
      return {
        result: false,
        error: "AI Return Error"
      };
    }
  }

  const convertMessages: Message[] = [{
    role: Role.System,
    content: CONVERT_PROMPT,
  }, {
    role: Role.User,
    content: doc.body.innerHTML
  }];

  const convertRes = await chatLLM(convertMessages).catch(() => '') || '';
  if (!convertRes) return {
    result: false,
    error: "AI Return Error"
  }
  if (controller?.signal.aborted) {
    return {
      result: false,
      error: "aborted"
    };
  }

  if (split) {
    const splitMessages: Message[] = [{
      role: Role.System,
      content: SPLIT_PROMPT,
    }, {
      role: Role.User,
      content: convertRes
    }];
    const splitRes = await chatLLM(splitMessages).catch(() => '[]') || '[]';
    let splitArray: string[] = [];
    try {
      splitArray = JSON.parse(splitRes);
    } catch (e) {
      return {
        result: false,
        error: "parse error"
      };
    }

    if (controller?.signal?.aborted) {
      return {
        result: false,
        error: "aborted"
      };
    }

    if (splitArray.length !== 2) {
      return {
        result: false,
        error: "parse error"
      };
    }

    const [res1, res2] = await Promise.all(splitArray.map(async item => {
      const messages: Message[] = [{
        role: Role.System,
        content: WEB_CLIP_PROMPT
      }, {
        role: Role.User,
        content: item
      }];
      let aiRes = await chatLLM(messages).catch(() => '');
      if (aiRes) {
        aiRes = aiRes.trim();
        if (aiRes.startsWith("```json") && aiRes.endsWith("```")) {
          aiRes = aiRes.slice(7, -3);
        }
      }
      return aiRes;
    }));

    const res1Json = JSON.parse(res1 || '[]');
    const res2Json = JSON.parse(res2 || '[]');

    return {
      result: true,
      value: [...res1Json, ...res2Json]
    };
  } else {
    const messages: Message[] = [{
      role: Role.System,
      content: WEB_CLIP_PROMPT
    }, {
      role: Role.User,
      content: convertRes
    }];
    let aiRes = await chatLLM(messages).catch(() => '');
    if (aiRes) {
      aiRes = aiRes.trim();
      if (aiRes.startsWith("```json") && aiRes.endsWith("```")) {
        aiRes = aiRes.slice(7, -3);
      }
    } else {
      return {
        result: false,
        error: "AI Return Error"
      }
    }
    try {
      return {
        result: true,
        value: JSON.parse(aiRes || '[]')
      };
    } catch (e) {
      return {
        result: false,
        error: "parse error"
      };
    }
  }
}
