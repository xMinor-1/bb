import { z } from "zod";

export const MAX_COMMENT_LENGTH = 10_000;
export const MAX_QUOTE_LENGTH = 2_000;
export const ANCHOR_CONTEXT_LENGTH = 32;
const QUOTE_PREVIEW_LENGTH = 600;

export const commentAnchorSchema = z
  .object({
    quote: z.string().min(1).max(MAX_QUOTE_LENGTH),
    prefix: z.string().max(ANCHOR_CONTEXT_LENGTH),
    suffix: z.string().max(ANCHOR_CONTEXT_LENGTH),
  })
  .strict();

export const commentReplySchema = z
  .object({
    id: z.string().min(1),
    author: z.enum(["user", "agent"]),
    body: z.string().min(1),
    outcome: z.enum(["replied", "resolved"]).nullable(),
    createdAt: z.number().nonnegative(),
    sentAt: z.number().nonnegative().nullable(),
  })
  .strict();

export const commentStatusSchema = z.enum([
  "draft",
  "sent",
  "replied",
  "resolved",
]);

export const commentSchema = z
  .object({
    id: z.string().min(1),
    vaultId: z.string().min(1),
    path: z.string().min(1),
    seq: z.number().int().positive(),
    anchor: commentAnchorSchema,
    body: z.string().min(1),
    status: commentStatusSchema,
    createdAt: z.number().nonnegative(),
    updatedAt: z.number().nonnegative(),
    sentAt: z.number().nonnegative().nullable(),
    sentThreadId: z.string().min(1).nullable(),
    thread: z.array(commentReplySchema),
  })
  .strict();

export const commentBodySchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(MAX_COMMENT_LENGTH));

export type CommentAnchor = z.infer<typeof commentAnchorSchema>;
export type CommentReply = z.infer<typeof commentReplySchema>;
export type CommentStatus = z.infer<typeof commentStatusSchema>;
export type DocsComment = z.infer<typeof commentSchema>;

export const commentsTag = (vaultId: string, path: string) =>
  `comments:${vaultId}:${path}`;

export function pendingReply(comment: DocsComment): CommentReply | null {
  const latest = comment.thread.at(-1);
  return latest?.author === "user" && latest.sentAt === null ? latest : null;
}

export function commentIsOpen(comment: DocsComment): boolean {
  return comment.status === "draft" || pendingReply(comment) !== null;
}

export function anchorFromRange(
  text: string,
  start: number,
  end: number,
): CommentAnchor | null {
  let from = Math.max(0, Math.min(start, end));
  let to = Math.min(text.length, Math.max(start, end));
  while (from < to && /\s/u.test(text[from]!)) from++;
  while (to > from && /\s/u.test(text[to - 1]!)) to--;
  if (from === to) return null;
  return {
    quote: text.slice(from, Math.min(to, from + MAX_QUOTE_LENGTH)),
    prefix: text.slice(Math.max(0, from - ANCHOR_CONTEXT_LENGTH), from),
    suffix: text.slice(to, to + ANCHOR_CONTEXT_LENGTH),
  };
}

function sharedSuffixLength(left: string, right: string): number {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  )
    length++;
  return length;
}

function sharedPrefixLength(left: string, right: string): number {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[length] === right[length]
  )
    length++;
  return length;
}

export function findQuote(
  text: string,
  anchor: CommentAnchor,
): { start: number; end: number } | null {
  let best: { start: number; end: number; score: number } | null = null;
  for (
    let start = text.indexOf(anchor.quote);
    start !== -1;
    start = text.indexOf(anchor.quote, start + 1)
  ) {
    const end = start + anchor.quote.length;
    const score =
      sharedSuffixLength(
        text.slice(Math.max(0, start - anchor.prefix.length), start),
        anchor.prefix,
      ) + sharedPrefixLength(text.slice(end), anchor.suffix);
    if (!best || score > best.score) best = { start, end, score };
  }
  return best && { start: best.start, end: best.end };
}

export function sourceLine(
  source: string,
  anchor: CommentAnchor,
): number | null {
  const firstLine = anchor.quote.split("\n")[0]!.trim();
  const found =
    findQuote(source, anchor) ??
    (firstLine.length >= 3
      ? findQuote(source, { ...anchor, quote: firstLine })
      : null);
  return found ? source.slice(0, found.start).split("\n").length : null;
}

function truncate(value: string, length: number): string {
  const flat = value.replace(/\s+/gu, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

function threadLines(comment: DocsComment): string[] {
  const fresh = pendingReply(comment);
  const earlier = fresh ? comment.thread.slice(0, -1) : comment.thread;
  const lines = earlier.map((reply) => {
    const who =
      reply.author === "user"
        ? "User"
        : reply.outcome === "resolved"
          ? "Agent (resolved)"
          : "Agent";
    return `> ${who}: ${truncate(reply.body, QUOTE_PREVIEW_LENGTH)}`;
  });
  if (fresh) lines.push(`User's new reply: ${fresh.body.trim()}`);
  else if (comment.thread.length > 0)
    lines.push("Sent again without a new reply.");
  return lines;
}

export function buildCommentHandoff(input: {
  vaultId: string;
  path: string;
  source: string | null;
  comments: DocsComment[];
}): string {
  const { vaultId, path, source, comments } = input;
  const lines = [
    `Review comments on the Docs document \`${path}\` in vault \`${vaultId}\`: ${comments.length} to address.`,
    `Read it with \`bb docs read ${path} --vault ${vaultId}\`.`,
    "",
  ];
  for (const comment of comments) {
    const line = source === null ? null : sourceLine(source, comment.anchor);
    const place =
      line === null ? `#${comment.seq}` : `#${comment.seq}, line ${line}`;
    lines.push(
      `[${comment.id}] ${place}: «${truncate(comment.anchor.quote, QUOTE_PREVIEW_LENGTH)}»`,
      comment.body.trim(),
      ...threadLines(comment),
      "",
    );
  }
  lines.push(
    "Line numbers refer to the file as it was when the comments were sent; find each place by its quoted text.",
  );
  if (comments.some((comment) => comment.thread.length > 0))
    lines.push(
      "A comment with `>` lines is a follow-up: they quote its thread so far. Act on the user's new reply in that context.",
    );
  lines.push(
    "Change the document with `bb docs pull` and `bb docs push`, or with `bb docs propose` when the user should approve the revision first.",
    'When a comment is done, close it with a one-line note: `bb docs comment-resolve <id> --note "what changed"`.',
    'If you cannot apply one or need an answer first, reply instead: `bb docs comment-reply <id> --note "question or reason"`.',
  );
  return lines.join("\n");
}

const STATUS_LABELS: Record<CommentStatus, string> = {
  draft: "draft",
  sent: "sent",
  replied: "answered",
  resolved: "resolved",
};

export function formatComments(comments: DocsComment[]): string {
  if (comments.length === 0) return "No comments.";
  return comments
    .map((comment) =>
      [
        `#${comment.seq} ${comment.id} (${STATUS_LABELS[comment.status]}${pendingReply(comment) ? ", new reply" : ""}): «${truncate(comment.anchor.quote, 80)}»`,
        `  ${truncate(comment.body, 200)}`,
        ...comment.thread.map(
          (reply) =>
            `  ${reply.author === "user" ? "User" : "Agent"}: ${truncate(reply.body, 200)}`,
        ),
      ].join("\n"),
    )
    .join("\n");
}
