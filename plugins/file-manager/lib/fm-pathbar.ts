import {
  getClientRoot,
  isAbsolutePath,
  isInsideRoot,
  joinPath,
  normalizePath,
  rootPhrase,
  toAbsolute,
} from "./fm-paths";
import { defineMessages, messagesNow } from "./i18n";

export type PathInputResult =
  | { kind: "empty" }
  | { kind: "path"; absolute: string }
  | { kind: "refused"; message: string };

export interface PathInputContext {
  root: string;
  currentPath: string;
}

const messages = defineMessages(
  {
    remote: "That looks like a path on another computer.",
    scheme: "Only paths on this computer can be opened here.",
    invalid: "That path is not valid.",
    windows: (root: string) =>
      `That looks like a Windows path. This panel opens paths under ${root}.`,
    outside: (root: string) => `That path is outside ${root}.`,
  },
  {
    remote: "Похоже, это путь на другом компьютере.",
    scheme: "Здесь открываются только пути на этом компьютере.",
    invalid: "Недопустимый путь.",
    windows: (root) =>
      `Похоже, это путь Windows. Панель открывает пути внутри ${root}.`,
    outside: (root) => `Этот путь вне ${root}.`,
  },
);

export function pathRemoteMessage(): string {
  return messagesNow(messages).remote;
}

export function pathSchemeMessage(): string {
  return messagesNow(messages).scheme;
}

export function pathInvalidMessage(): string {
  return messagesNow(messages).invalid;
}

export function windowsPathMessage(root: string = getClientRoot()): string {
  return messagesNow(messages).windows(rootPhrase(root));
}

export function outsideRootMessage(root: string = getClientRoot()): string {
  return messagesNow(messages).outside(rootPhrase(root));
}

type Cleaned =
  | { kind: "empty" }
  | { kind: "value"; value: string }
  | { kind: "refused"; message: string };

function isWindowsShaped(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/u.test(value)) return true;
  if (value.startsWith("\\\\")) return true;
  return value.includes("\\") && !value.includes("/");
}

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/u;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/u;

function decodeFileUrl(value: string): Cleaned {
  const rest = value.slice("file:".length);
  let path = rest;
  if (rest.startsWith("//")) {
    const afterAuthority = rest.indexOf("/", 2);
    const authority =
      afterAuthority === -1 ? rest.slice(2) : rest.slice(2, afterAuthority);
    if (authority !== "" && authority.toLowerCase() !== "localhost") {
      return { kind: "refused", message: pathRemoteMessage() };
    }
    path = afterAuthority === -1 ? "" : rest.slice(afterAuthority);
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    return { kind: "refused", message: pathInvalidMessage() };
  }
  if (path === "") return { kind: "empty" };
  return { kind: "value", value: path };
}

function cleanup(raw: string, root: string): Cleaned {
  let value = "";
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed !== "") {
      value = trimmed;
      break;
    }
  }
  if (value === "") return { kind: "empty" };

  let quoted = false;
  const first = value.charAt(0);
  if (
    value.length >= 2 &&
    (first === '"' || first === "'") &&
    value.endsWith(first)
  ) {
    value = value.slice(1, -1);
    quoted = true;
  }

  if (!quoted && value.includes("\\ ")) {
    value = value.replace(/\\(.)/gu, "$1");
  }

  if (isWindowsShaped(value)) {
    return { kind: "refused", message: windowsPathMessage(root) };
  }

  const scheme = SCHEME.exec(value);
  if (scheme !== null) {
    if (scheme[1]?.toLowerCase() !== "file") {
      return { kind: "refused", message: pathSchemeMessage() };
    }
    const decoded = decodeFileUrl(value);
    if (decoded.kind !== "value") return decoded;
    value = decoded.value;
    if (/^\/[a-zA-Z]:[\\/]/u.test(value)) value = value.slice(1);
    if (isWindowsShaped(value)) {
      return { kind: "refused", message: windowsPathMessage(root) };
    }
  }

  if (CONTROL_CHARS.test(value)) {
    return { kind: "refused", message: pathInvalidMessage() };
  }

  if (value === "") return { kind: "empty" };
  return { kind: "value", value };
}

function resolve(value: string, context: PathInputContext): string {
  if (value === "~" || value === "~/" || value.startsWith("~/")) {
    return toAbsolute(value, context.root);
  }
  if (isAbsolutePath(value)) return normalizePath(value);
  return joinPath(context.currentPath, value);
}

export function parsePathInput(
  raw: string,
  context: PathInputContext,
): PathInputResult {
  const cleaned = cleanup(raw, context.root);
  if (cleaned.kind === "empty") return { kind: "empty" };
  if (cleaned.kind === "refused")
    return { kind: "refused", message: cleaned.message };

  const absolute = resolve(cleaned.value, context);
  if (!isInsideRoot(absolute, context.root)) {
    return { kind: "refused", message: outsideRootMessage(context.root) };
  }
  return { kind: "path", absolute };
}

export interface CompletionSplit {
  dir: string;
  prefix: string;
}

export function splitForCompletion(
  raw: string,
  context: PathInputContext,
): CompletionSplit | null {
  const cleaned = cleanup(raw, context.root);
  if (cleaned.kind !== "value") return null;
  const value = cleaned.value;
  const index = value.lastIndexOf("/");
  if (index === -1)
    return { dir: normalizePath(context.currentPath), prefix: value };
  const head = value.slice(0, index + 1);
  const prefix = value.slice(index + 1);
  const dir = resolve(head, context);
  if (!isInsideRoot(dir, context.root)) return null;
  return { dir, prefix };
}
