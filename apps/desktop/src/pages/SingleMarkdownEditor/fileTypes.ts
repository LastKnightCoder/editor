export type FileCategory =
  | "markdown"
  | "code"
  | "image"
  | "video"
  | "audio"
  | "external"
  | "unknown";

const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
  ".avif",
  ".ico",
];

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".mkv",
  ".webm",
  ".avi",
  ".flv",
  ".wmv",
];

const AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".ogg",
  ".flac",
  ".wma",
];

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

const EXTERNAL_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
];

const CODE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".css",
  ".less",
  ".scss",
  ".sass",
  ".html",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".conf",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".sql",
  ".graphql",
  ".vue",
  ".svelte",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".clj",
  ".lua",
  ".r",
  ".dart",
  ".elm",
  ".ex",
  ".erl",
  ".dockerfile",
  ".gitignore",
  ".env",
  ".log",
  ".txt",
];

const getExtension = (fileName: string): string => {
  const lower = fileName.toLowerCase();
  const lastDot = lower.lastIndexOf(".");
  if (lastDot <= 0) return "";
  return lower.slice(lastDot);
};

export const getFileCategory = (fileName: string): FileCategory => {
  const ext = getExtension(fileName);
  if (!ext) return "unknown";

  if (MARKDOWN_EXTENSIONS.includes(ext)) return "markdown";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (EXTERNAL_EXTENSIONS.includes(ext)) return "external";
  if (CODE_EXTENSIONS.includes(ext)) return "code";

  return "unknown";
};

export const isSupportedFile = (fileName: string): boolean => {
  return getFileCategory(fileName) !== "unknown";
};

const MODE_MAP: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "jsx",
  ".ts": "text/typescript",
  ".tsx": "text/typescript-jsx",
  ".json": "application/json",
  ".css": "css",
  ".less": "text/x-less",
  ".scss": "text/x-scss",
  ".sass": "text/x-sass",
  ".html": "htmlmixed",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".ini": "properties",
  ".conf": "properties",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "text/x-java",
  ".c": "text/x-csrc",
  ".cpp": "text/x-c++src",
  ".h": "text/x-csrc",
  ".hpp": "text/x-c++src",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".sql": "sql",
  ".graphql": "javascript",
  ".vue": "vue",
  ".svelte": "htmlmixed",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "text/x-kotlin",
  ".scala": "text/x-scala",
  ".clj": "clojure",
  ".lua": "lua",
  ".r": "r",
  ".dart": "dart",
  ".elm": "elm",
  ".ex": "elixir",
  ".erl": "erlang",
  ".dockerfile": "dockerfile",
  ".gitignore": "shell",
  ".env": "shell",
  ".log": "text",
  ".txt": "text",
  ".md": "markdown",
  ".markdown": "markdown",
};

export const getCodeMirrorMode = (fileName: string): string => {
  const ext = getExtension(fileName);
  return MODE_MAP[ext] || "text";
};
