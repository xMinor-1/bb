import { errorCodeSchema, type FileManagerErrorCode } from "../contract";
import { defineMessages, messagesNow, pluralRu } from "./i18n";

const ERROR_CODES: ReadonlySet<string> = new Set<string>(
  errorCodeSchema.options,
);

const WIRE_CODES: ReadonlySet<string> = new Set([
  "handler_error",
  "invalid_input",
  "invalid_json",
  "invalid_output",
  "non_json_result",
  "unknown_method",
]);

export interface ParsedRpcError {
  code: FileManagerErrorCode | null;
  message: string;
  rawMessage: string;
  wireCode: string | null;
}

export function isFileManagerErrorCode(
  value: unknown,
): value is FileManagerErrorCode {
  return typeof value === "string" && ERROR_CODES.has(value);
}

function readString(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function rawMessageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const message = readString(error, "message");
  if (message !== null) return message;
  if (error === undefined || error === null) return "";
  try {
    return String(error);
  } catch {
    return "";
  }
}

export function parseRpcError(error: unknown): ParsedRpcError {
  if (error instanceof FileManagerRpcError) {
    return {
      code: error.code,
      message: error.message,
      rawMessage: error.rawMessage,
      wireCode: error.wireCode,
    };
  }

  const rawMessage = rawMessageOf(error);
  const wireCandidate = readString(error, "code");
  const wireCode =
    wireCandidate !== null && WIRE_CODES.has(wireCandidate)
      ? wireCandidate
      : null;

  const separator = rawMessage.indexOf(": ");
  if (separator > 0) {
    const prefix = rawMessage.slice(0, separator);
    if (ERROR_CODES.has(prefix)) {
      return {
        code: prefix as FileManagerErrorCode,
        message: rawMessage.slice(separator + 2).trim(),
        rawMessage,
        wireCode,
      };
    }
  }

  if (ERROR_CODES.has(rawMessage)) {
    return {
      code: rawMessage as FileManagerErrorCode,
      message: describeErrorCode(rawMessage as FileManagerErrorCode),
      rawMessage,
      wireCode,
    };
  }

  return { code: null, message: rawMessage, rawMessage, wireCode };
}

export class FileManagerRpcError extends Error {
  readonly code: FileManagerErrorCode | null;
  readonly wireCode: string | null;
  readonly rawMessage: string;

  constructor(parsed: ParsedRpcError, options?: { cause?: unknown }) {
    super(parsed.message === "" ? parsed.rawMessage : parsed.message, options);
    this.name = "FileManagerRpcError";
    this.code = parsed.code;
    this.wireCode = parsed.wireCode;
    this.rawMessage = parsed.rawMessage;
  }
}

export function toFileManagerError(error: unknown): FileManagerRpcError {
  if (error instanceof FileManagerRpcError) return error;
  return new FileManagerRpcError(parseRpcError(error), { cause: error });
}

const CODE_TEXT = defineMessages(
  {
    invalid_path: "That path is not valid.",
    invalid_name: "That name is not allowed.",
    path_escape: "That path is outside the file manager root.",
    not_found: "That item no longer exists.",
    not_a_directory: "That path is not a folder.",
    not_a_file: "That path is not a file.",
    exists: "An item with that name already exists.",
    not_empty: "That folder is not empty.",
    permission_denied: "Permission denied.",
    cross_device: "That move crossed a filesystem boundary and failed.",
    destination_inside_source: "A folder cannot be moved into itself.",
    unsupported_archive: "That archive format is not supported.",
    archive_failed: "Extraction failed.",
    upload_not_found: "The upload session expired.",
    upload_busy: "Another chunk of this upload is still in flight.",
    offset_mismatch: "The upload lost sync and has to resume.",
    size_mismatch: "The file changed while it was uploading.",
    no_space: "There is not enough free disk space.",
    io_error: "The filesystem reported an error.",
    unsupported: "That operation is not supported.",
  } satisfies Record<FileManagerErrorCode, string>,
  {
    invalid_path: "Недопустимый путь.",
    invalid_name: "Такое имя нельзя использовать.",
    path_escape: "Этот путь вне корневой папки файлового менеджера.",
    not_found: "Этого больше нет.",
    not_a_directory: "Это не папка.",
    not_a_file: "Это не файл.",
    exists: "Элемент с таким именем уже есть.",
    not_empty: "Папка не пуста.",
    permission_denied: "Нет доступа.",
    cross_device: "Перемещение между файловыми системами не удалось.",
    destination_inside_source: "Папку нельзя переместить в саму себя.",
    unsupported_archive: "Этот формат архива не поддерживается.",
    archive_failed: "Не удалось распаковать.",
    upload_not_found: "Сеанс загрузки истёк.",
    upload_busy: "Предыдущая часть этой загрузки ещё передаётся.",
    offset_mismatch: "Загрузка сбилась и возобновится.",
    size_mismatch: "Файл изменился во время загрузки.",
    no_space: "Не хватает места на диске.",
    io_error: "Файловая система сообщила об ошибке.",
    unsupported: "Эта операция не поддерживается.",
  },
);

const messages = defineMessages(
  {
    fallback: "Something went wrong.",
    batchFailed: (count: number, action: string) =>
      `${String(count)} items failed to ${action}.`,
  },
  {
    fallback: "Что-то пошло не так.",
    batchFailed: (count, action) =>
      `Не удалось ${action} ${String(count)} ${pluralRu(count, ["элемент", "элемента", "элементов"])}.`,
  },
);

const ACTION_VERBS = defineMessages(
  {
    move: "move",
    copy: "copy",
    delete: "delete",
    operation: "process",
  } as Record<string, string>,
  {
    move: "переместить",
    copy: "скопировать",
    delete: "удалить",
    operation: "обработать",
  },
);

export function describeErrorCode(code: FileManagerErrorCode): string {
  return messagesNow(CODE_TEXT)[code];
}

export function errorToastText(error: unknown, fallback?: string): string {
  const parsed = parseRpcError(error);
  if (parsed.code !== null) return describeErrorCode(parsed.code);
  const message = parsed.message.trim();
  return message === ""
    ? (fallback ?? messagesNow(messages).fallback)
    : message;
}

export const toastText = errorToastText;

export interface BatchFailure {
  path: string;
  code: FileManagerErrorCode;
  message: string;
}

export function batchFailureText(
  failed: readonly BatchFailure[],
  action = "operation",
): string | null {
  if (failed.length === 0) return null;
  const first = failed[0];
  if (first === undefined) return null;
  const name = baseNameOf(first.path);
  const reason = describeErrorCode(first.code);
  if (failed.length === 1) return `${name}: ${reason}`;
  const verbs = messagesNow(ACTION_VERBS);
  const verb = verbs[action] ?? verbs.operation ?? action;
  return `${messagesNow(messages).batchFailed(failed.length, verb)} ${name}: ${reason}`;
}

function baseNameOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const index = trimmed.lastIndexOf("/");
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}
