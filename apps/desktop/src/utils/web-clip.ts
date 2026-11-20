export const getContentHTML = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script").forEach(script => script.remove());
  // 微信公众号的内容都在 page-content 中
  const pageContent = doc.getElementById("page-content");
  return pageContent?.innerHTML || doc.body.innerHTML;
};
