import { describe, expect, it } from "vitest";
import {
  anchorFromRange,
  buildCommentHandoff,
  commentIsOpen,
  findQuote,
  sourceLine,
  type DocsComment,
} from "./comments";

function comment(overrides: Partial<DocsComment> = {}): DocsComment {
  return {
    id: "cmt_1",
    vaultId: "personal",
    path: "plan.md",
    seq: 1,
    anchor: { quote: "ship it", prefix: "then ", suffix: " on Friday" },
    body: "Say which Friday.",
    status: "draft",
    createdAt: 1,
    updatedAt: 1,
    sentAt: null,
    sentThreadId: null,
    thread: [],
    ...overrides,
  };
}

describe("comment anchors", () => {
  it("trims the selection and keeps context on both sides", () => {
    const text = "Plan\nWe test, then ship it on Friday.";
    const start = text.indexOf(" ship");
    expect(anchorFromRange(text, start, start + " ship it ".length)).toEqual({
      quote: "ship it",
      prefix: "Plan\nWe test, then ",
      suffix: " on Friday.",
    });
    expect(anchorFromRange(text, 4, 5)).toBeNull();
  });

  it("picks the occurrence whose surroundings match", () => {
    const text = "ship it today. Then ship it on Friday.";
    expect(findQuote(text, comment().anchor)).toEqual({
      start: text.lastIndexOf("ship it"),
      end: text.lastIndexOf("ship it") + "ship it".length,
    });
    expect(
      findQuote(text, { quote: "ship it", prefix: "", suffix: " today" }),
    ).toEqual({ start: 0, end: 7 });
    expect(
      findQuote(text, { quote: "launch", prefix: "", suffix: "" }),
    ).toBeNull();
  });

  it("finds the source line of a quote, or of its first line", () => {
    const source = "# Plan\n\nWe test, then ship it on Friday.\n";
    expect(sourceLine(source, comment().anchor)).toBe(3);
    expect(
      sourceLine("# Plan\n\n- **Risks**\n- none", {
        quote: "Plan\nRisks",
        prefix: "",
        suffix: "",
      }),
    ).toBe(1);
    expect(
      sourceLine(source, { quote: "absent", prefix: "", suffix: "" }),
    ).toBeNull();
  });
});

describe("comment handoff", () => {
  it("counts drafts and unsent replies as open", () => {
    expect(commentIsOpen(comment())).toBe(true);
    const answered = comment({
      status: "replied",
      thread: [
        {
          id: "rpl_1",
          author: "agent",
          body: "Which Friday?",
          outcome: "replied",
          createdAt: 2,
          sentAt: 2,
        },
      ],
    });
    expect(commentIsOpen(answered)).toBe(false);
    expect(
      commentIsOpen({
        ...answered,
        thread: [
          ...answered.thread,
          {
            id: "rpl_2",
            author: "user",
            body: "The 14th.",
            outcome: null,
            createdAt: 3,
            sentAt: null,
          },
        ],
      }),
    ).toBe(true);
  });

  it("lists every comment with its id, line, quote, thread, and the CLI to close it", () => {
    const prompt = buildCommentHandoff({
      vaultId: "personal",
      path: "plan.md",
      source: "# Plan\n\nWe test, then ship it on Friday.\n",
      comments: [
        comment(),
        comment({
          id: "cmt_2",
          seq: 2,
          status: "replied",
          anchor: { quote: "We test", prefix: "", suffix: "" },
          body: "Which tests?",
          thread: [
            {
              id: "rpl_1",
              author: "agent",
              body: "Unit or e2e?",
              outcome: "replied",
              createdAt: 2,
              sentAt: 2,
            },
            {
              id: "rpl_2",
              author: "user",
              body: "Both.",
              outcome: null,
              createdAt: 3,
              sentAt: null,
            },
          ],
        }),
      ],
    });
    expect(prompt).toContain(
      "Review comments on the Docs document `plan.md` in vault `personal`: 2 to address.",
    );
    expect(prompt).toContain(
      "[cmt_1] #1, line 3: «ship it»\nSay which Friday.",
    );
    expect(prompt).toContain(
      "[cmt_2] #2, line 3: «We test»\nWhich tests?\n> Agent: Unit or e2e?\nUser's new reply: Both.",
    );
    expect(prompt).toContain("bb docs comment-resolve <id>");
    expect(prompt).toContain("bb docs comment-reply <id>");
  });
});
