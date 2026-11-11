import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  experimental_useRpcMutation as useRpcMutation,
  experimental_useRpcQuery as useRpcQuery,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { docsRpcContract, errorMessage } from "./contract.js";
import {
  commentIsOpen,
  pendingReply,
  type CommentAnchor,
  type DocsComment,
} from "./comments.js";
import type { CommentHighlight } from "./comment-highlights.js";

export interface EditorCommenting {
  comments: CommentHighlight[];
  activeCommentId: string | null;
  onActivateComment(id: string): void;
  onSelectionAnchor(anchor: CommentAnchor | null): void;
  onCommentShortcut(): boolean;
  onLocatedComments(ids: ReadonlySet<string>): void;
}

const STATUS_LABELS: Record<DocsComment["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  replied: "Answered",
  resolved: "Resolved",
};

function submitOnModEnter(event: KeyboardEvent, submit: () => void) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    submit();
  }
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function CommentCard({
  comment,
  active,
  located,
  onActivate,
}: {
  comment: DocsComment;
  active: boolean;
  located: boolean;
  onActivate(): void;
}) {
  const reply = useRpcMutation({
    contract: docsRpcContract,
    method: "replyToComment",
  });
  const reopen = useRpcMutation({
    contract: docsRpcContract,
    method: "reopenComment",
  });
  const remove = useRpcMutation({
    contract: docsRpcContract,
    method: "deleteComment",
  });
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await work();
      return true;
    } catch (error) {
      toast.error(`${failure}: ${errorMessage(error)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const sendReply = async () => {
    const body = text.trim();
    if (!body) return;
    if (
      await run(
        () => reply.mutate({ id: comment.id, body }),
        "Could not save the reply",
      )
    ) {
      setText("");
      setReplying(false);
    }
  };
  const unsent = pendingReply(comment);
  return (
    <li
      aria-label={`Comment ${comment.seq}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "space-y-2 border-b border-border px-3 py-3 text-xs",
        active && "bg-surface-selected",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="font-semibold text-foreground">#{comment.seq}</span>
        <span>{STATUS_LABELS[comment.status]}</span>
        {unsent && <span>Reply not sent</span>}
        {!located && <span>Text changed</span>}
      </div>
      <button
        type="button"
        onClick={onActivate}
        className="block w-full cursor-pointer border-l-2 border-attention pl-2 text-left text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={`Show comment ${comment.seq} in the document`}
      >
        <span className="line-clamp-2">{comment.anchor.quote}</span>
      </button>
      <p className="whitespace-pre-wrap text-sm text-foreground">
        {comment.body}
      </p>
      {comment.thread.length > 0 && (
        <ol className="space-y-1.5" aria-label="Replies">
          {comment.thread.map((item) => (
            <li key={item.id} className="whitespace-pre-wrap">
              <span className="font-medium text-foreground">
                {item.author === "agent"
                  ? item.outcome === "resolved"
                    ? "Agent resolved"
                    : "Agent"
                  : "You"}
                :{" "}
              </span>
              {item.body}
            </li>
          ))}
        </ol>
      )}
      {replying ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            aria-label={`Reply to comment ${comment.seq}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setReplying(false);
              submitOnModEnter(event, () => void sendReply());
            }}
            className="min-h-16 text-sm"
          />
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setReplying(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || !text.trim()}
              onClick={() => void sendReply()}
            >
              Reply
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1">
          {comment.status !== "draft" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setReplying(true)}
            >
              Reply
            </Button>
          )}
          {comment.status === "resolved" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(
                  () => reopen.mutate({ id: comment.id }),
                  "Could not reopen the comment",
                )
              }
            >
              Reopen
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Delete comment ${comment.seq}`}
            onClick={() =>
              void run(
                () => remove.mutate({ id: comment.id }),
                "Could not delete the comment",
              )
            }
          >
            Delete
          </Button>
        </div>
      )}
    </li>
  );
}

export function DocumentComments({
  vaultId,
  path,
  threadId,
  beforeSend,
  children,
}: {
  vaultId: string;
  path: string;
  threadId: string | null;
  beforeSend(): Promise<void>;
  children(commenting: EditorCommenting): ReactNode;
}) {
  const navigate = useBbNavigate();
  const query = useRpcQuery({
    contract: docsRpcContract,
    method: "listComments",
    input: { vaultId, path },
  });
  const add = useRpcMutation({
    contract: docsRpcContract,
    method: "addComment",
  });
  const handOff = useRpcMutation({
    contract: docsRpcContract,
    method: "handOffComments",
  });
  const comments = useMemo(() => query.data?.comments ?? [], [query.data]);
  const highlights = useMemo(
    () => comments.map(({ id, anchor }) => ({ id, anchor })),
    [comments],
  );
  const [open, setOpen] = useState<boolean | null>(null);
  const [selection, setSelection] = useState<CommentAnchor | null>(null);
  const [draft, setDraft] = useState<CommentAnchor | null>(null);
  const [text, setText] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [located, setLocated] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const shown = open ?? comments.length > 0;
  const openCount = comments.filter(commentIsOpen).length;
  const startComment = () => {
    if (!selection) return false;
    setDraft(selection);
    setText("");
    setOpen(true);
    return true;
  };
  const saveComment = async () => {
    const body = text.trim();
    if (!draft || !body) return;
    setBusy(true);
    try {
      const created = await add.mutate({ vaultId, path, anchor: draft, body });
      setDraft(null);
      setText("");
      setActiveId(created.id);
      await query.refetch();
    } catch (error) {
      toast.error(`Could not add the comment: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };
  const send = async (target: string | null) => {
    setBusy(true);
    try {
      await beforeSend();
      const result = await handOff.mutate({ vaultId, path, threadId: target });
      await query.refetch();
      if (target === null)
        navigate.toCompose({ initialPrompt: result.prompt, focusPrompt: true });
      else
        toast.success(
          `Sent ${result.sent.length} comment${result.sent.length === 1 ? "" : "s"} to the agent`,
        );
    } catch (error) {
      toast.error(`Could not send the comments: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };
  const commenting: EditorCommenting = {
    comments: highlights,
    activeCommentId: activeId,
    onActivateComment: (id) => {
      setActiveId(id);
      setOpen(true);
    },
    onSelectionAnchor: setSelection,
    onCommentShortcut: startComment,
    onLocatedComments: (ids) =>
      setLocated((current) => (sameIds(current, ids) ? current : ids)),
  };
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {children(commenting)}
        {!shown && (
          <Button
            size="sm"
            variant="outline"
            className="absolute right-3 bottom-3 gap-1.5 bg-background"
            onClick={() => (selection ? startComment() : setOpen(true))}
          >
            <Icon name="MessageSquare" className="size-3" />
            {selection
              ? "Comment"
              : `Comments${comments.length ? ` ${comments.length}` : ""}`}
          </Button>
        )}
      </div>
      {shown && (
        <aside
          aria-label="Comments"
          className="flex w-72 shrink-0 flex-col border-l border-border bg-background"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span className="flex-1 font-semibold">
              Comments{comments.length ? ` ${comments.length}` : ""}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label="Hide comments"
              onClick={() => setOpen(false)}
            >
              <Icon name="X" className="size-3" />
            </Button>
          </div>
          <div className="space-y-2 border-b border-border p-3 text-xs">
            {draft ? (
              <>
                <p className="line-clamp-3 border-l-2 border-attention pl-2 text-muted-foreground">
                  {draft.quote}
                </p>
                <Textarea
                  autoFocus
                  aria-label="New comment"
                  placeholder="What should change?"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setDraft(null);
                    submitOnModEnter(event, () => void saveComment());
                  }}
                  className="min-h-20 text-sm"
                />
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDraft(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || !text.trim()}
                    onClick={() => void saveComment()}
                  >
                    Comment
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={!selection}
                  onClick={startComment}
                >
                  Comment on selection
                </Button>
                {!selection && (
                  <p className="text-muted-foreground">
                    Select text in the document to comment on it.
                  </p>
                )}
              </>
            )}
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto">
            {comments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                active={comment.id === activeId}
                located={located.has(comment.id)}
                onActivate={() => setActiveId(comment.id)}
              />
            ))}
          </ol>
          <div className="space-y-2 border-t border-border p-3 text-xs">
            <p className="text-muted-foreground">
              {openCount === 0
                ? "No comments waiting for the agent."
                : `${openCount} comment${openCount === 1 ? "" : "s"} ready to send.`}
            </p>
            <div className="flex gap-1">
              {threadId !== null && (
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={busy || openCount === 0}
                  onClick={() => void send(threadId)}
                >
                  Send to this thread
                </Button>
              )}
              <Button
                size="sm"
                variant={threadId === null ? "default" : "outline"}
                className="flex-1"
                disabled={busy || openCount === 0}
                onClick={() => void send(null)}
              >
                Send to new thread
              </Button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
