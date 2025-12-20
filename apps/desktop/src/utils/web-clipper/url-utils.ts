export function makeUrlAbsolute(
  element: Element,
  attributeName: string,
  baseUrl: URL,
) {
  const attributeValue = element.getAttribute(attributeName);
  if (!attributeValue) {
    return;
  }

  if (attributeName === "srcset") {
    const newSrcset = attributeValue
      .split(",")
      .map((src) => {
        const [url, size] = src.trim().split(/\s+/);
        try {
          const absoluteUrl = new URL(url, baseUrl).href;
          return size ? `${absoluteUrl} ${size}` : absoluteUrl;
        } catch (error) {
          return src.trim();
        }
      })
      .join(", ");
    element.setAttribute(attributeName, newSrcset);
    return;
  }

  try {
    const resolvedBaseUrl = new URL(baseUrl.href);
    if (!resolvedBaseUrl.pathname.endsWith("/")) {
      resolvedBaseUrl.pathname = resolvedBaseUrl.pathname.substring(
        0,
        resolvedBaseUrl.pathname.lastIndexOf("/") + 1,
      );
    }

    const url = new URL(attributeValue, resolvedBaseUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      const parts = attributeValue.split("/");
      const firstSegment = parts[2];
      if (firstSegment && firstSegment.includes(".")) {
        const newUrl = `${baseUrl.protocol}//${attributeValue.split("://")[1]}`;
        element.setAttribute(attributeName, newUrl);
      } else {
        const path = parts.slice(3).join("/");
        const newUrl = new URL(
          path,
          resolvedBaseUrl.origin + resolvedBaseUrl.pathname,
        ).href;
        element.setAttribute(attributeName, newUrl);
      }
      return;
    }

    element.setAttribute(attributeName, url.href);
  } catch (error) {
    console.warn(`Failed to process URL: ${attributeValue}`, error);
    element.setAttribute(attributeName, attributeValue);
  }
}

export function processUrls(htmlContent: string, baseUrl: URL): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");

  doc.querySelectorAll("img").forEach((img) => {
    makeUrlAbsolute(img, "srcset", baseUrl);
    makeUrlAbsolute(img, "src", baseUrl);
  });
  doc.querySelectorAll("a").forEach((link) => {
    makeUrlAbsolute(link, "href", baseUrl);
  });
  doc.querySelectorAll("source").forEach((source) => {
    makeUrlAbsolute(source, "srcset", baseUrl);
    makeUrlAbsolute(source, "src", baseUrl);
  });
  doc.querySelectorAll("video").forEach((video) => {
    makeUrlAbsolute(video, "poster", baseUrl);
  });

  const serializer = new XMLSerializer();
  let result = "";
  Array.from(doc.body.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      result += serializer.serializeToString(node);
    } else if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? "";
    }
  });

  return result;
}

export function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/)
    ) {
      return hostname;
    }

    const hostParts = hostname.split(".");
    if (hostParts.length > 2) {
      const lastTwo = hostParts.slice(-2).join(".");
      if (lastTwo.match(/^(co|com|org|net|edu|gov|mil)\.[a-z]{2}$/)) {
        return hostParts.slice(-3).join(".");
      }
    }

    return hostParts.slice(-2).join(".");
  } catch (error) {
    console.warn("Invalid URL:", url);
    return "";
  }
}
