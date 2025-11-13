export const extractUrlFromTitle = (
  title: string,
): { title: string; url: string } => {
  const urlRegex = /\[(https?:\/\/[^\]]+)\]$/;
  const match = title.match(urlRegex);

  if (match && match[1]) {
    return {
      title: title.replace(urlRegex, "").trim(),
      url: match[1],
    };
  }

  return { title, url: "" };
};
