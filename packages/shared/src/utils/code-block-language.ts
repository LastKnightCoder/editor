export interface CodeBlockLanguageOption {
  label: string;
  value: string;
}

interface CodeBlockLanguageDefinition {
  value: string;
  aliases: string[];
}

const CODE_BLOCK_LANGUAGE_DEFINITIONS: CodeBlockLanguageDefinition[] = [
  {
    value: "Plain Text",
    aliases: ["plain text", "plaintext", "text", "txt"],
  },
  {
    value: "JavaScript",
    aliases: ["javascript", "js"],
  },
  {
    value: "TypeScript",
    aliases: ["typescript", "ts"],
  },
  {
    value: "JSX",
    aliases: ["jsx"],
  },
  {
    value: "TSX",
    aliases: ["tsx"],
  },
  {
    value: "HTML",
    aliases: ["html"],
  },
  {
    value: "HTML/XML",
    aliases: ["html/xml"],
  },
  {
    value: "XML",
    aliases: ["xml"],
  },
  {
    value: "CSS",
    aliases: ["css"],
  },
  {
    value: "SCSS",
    aliases: ["scss"],
  },
  {
    value: "Sass",
    aliases: ["sass"],
  },
  {
    value: "Vue",
    aliases: ["vue"],
  },
  {
    value: "JSON",
    aliases: ["json"],
  },
  {
    value: "YAML",
    aliases: ["yaml", "yml"],
  },
  {
    value: "TOML",
    aliases: ["toml"],
  },
  {
    value: "Markdown",
    aliases: ["markdown", "md"],
  },
  {
    value: "Bash",
    aliases: ["bash"],
  },
  {
    value: "Shell",
    aliases: ["shell", "sh", "zsh"],
  },
  {
    value: "Diff",
    aliases: ["diff", "patch"],
  },
  {
    value: "HTTP",
    aliases: ["http"],
  },
  {
    value: "SQL",
    aliases: ["sql"],
  },
  {
    value: "MySQL",
    aliases: ["mysql"],
  },
  {
    value: "GraphQL",
    aliases: ["graphql", "gql"],
  },
  {
    value: "Dockerfile",
    aliases: ["dockerfile", "docker"],
  },
  {
    value: "LaTeX",
    aliases: ["latex", "tex", "stex"],
  },
  {
    value: "C",
    aliases: ["c"],
  },
  {
    value: "C++",
    aliases: ["c++", "cpp", "cc", "cxx"],
  },
  {
    value: "C#",
    aliases: ["c#", "csharp", "cs"],
  },
  {
    value: "Java",
    aliases: ["java"],
  },
  {
    value: "Kotlin",
    aliases: ["kotlin", "kt"],
  },
  {
    value: "Swift",
    aliases: ["swift"],
  },
  {
    value: "Go",
    aliases: ["go", "golang"],
  },
  {
    value: "Rust",
    aliases: ["rust", "rs"],
  },
  {
    value: "Python",
    aliases: ["python", "py"],
  },
  {
    value: "Ruby",
    aliases: ["ruby", "rb"],
  },
  {
    value: "PHP",
    aliases: ["php"],
  },
  {
    value: "Objective C",
    aliases: ["objective c", "objective-c", "objectivec", "objc"],
  },
  {
    value: "Scala",
    aliases: ["scala"],
  },
  {
    value: "PowerShell",
    aliases: ["powershell", "pwsh", "ps1"],
  },
  {
    value: "Protocol Buffer",
    aliases: ["protocol buffer", "protobuf", "proto"],
  },
  {
    value: "R",
    aliases: ["r"],
  },
  {
    value: "Lua",
    aliases: ["lua"],
  },
  {
    value: "Perl",
    aliases: ["perl", "pl"],
  },
  {
    value: "NGINX",
    aliases: ["nginx"],
  },
];

const CODE_BLOCK_LANGUAGE_DISPLAY_NAME_MAP = new Map<string, string>();

CODE_BLOCK_LANGUAGE_DEFINITIONS.forEach(({ value, aliases }) => {
  CODE_BLOCK_LANGUAGE_DISPLAY_NAME_MAP.set(value.toLowerCase(), value);
  aliases.forEach((alias) => {
    CODE_BLOCK_LANGUAGE_DISPLAY_NAME_MAP.set(alias.toLowerCase(), value);
  });
});

export const CODE_BLOCK_LANGUAGE_OPTIONS: CodeBlockLanguageOption[] =
  CODE_BLOCK_LANGUAGE_DEFINITIONS.map(({ value }) => ({
    label: value,
    value,
  }));

export const normalizeCodeBlockLanguageDisplayName = (
  language: unknown,
): string => {
  if (typeof language !== "string") return "";
  const trimmedLanguage = language.trim();
  if (!trimmedLanguage) return "";
  return (
    CODE_BLOCK_LANGUAGE_DISPLAY_NAME_MAP.get(trimmedLanguage.toLowerCase()) ||
    trimmedLanguage
  );
};
