import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { anchorFromRange, findQuote, type CommentAnchor } from "./comments.js";

export interface CommentHighlight {
  id: string;
  anchor: CommentAnchor;
}

type Range = { from: number; to: number };

interface HighlightState {
  highlights: CommentHighlight[];
  activeId: string | null;
  ranges: Map<string, Range>;
  decorations: DecorationSet;
}

interface HighlightMeta {
  highlights?: CommentHighlight[];
  activeId?: string | null;
}

export const commentHighlightsKey = new PluginKey<HighlightState>(
  "docsCommentHighlights",
);

export function documentText(doc: ProseMirrorNode): {
  text: string;
  positions: number[];
} {
  const parts: string[] = [];
  const positions: number[] = [];
  let endsWithBreak = true;
  const push = (value: string, position: number) => {
    for (let index = 0; index < value.length; index++)
      positions.push(position + index);
    parts.push(value);
    endsWithBreak = value.endsWith("\n");
  };
  doc.descendants((node, position) => {
    if (node.isText) {
      push(node.text ?? "", position);
      return false;
    }
    if (node.type.name === "hardBreak") push("\n", position);
    else if (node.isBlock && !endsWithBreak) push("\n", position);
    return true;
  });
  return { text: parts.join(""), positions };
}

export function selectionAnchor(state: EditorState): CommentAnchor | null {
  const { from, to, empty } = state.selection;
  if (empty) return null;
  const { text, positions } = documentText(state.doc);
  const start = positions.findIndex((position) => position >= from);
  if (start === -1) return null;
  let end = start;
  while (end < positions.length && positions[end]! < to) end++;
  return anchorFromRange(text, start, end);
}

function locate(
  doc: ProseMirrorNode,
  highlights: CommentHighlight[],
): Map<string, Range> {
  const ranges = new Map<string, Range>();
  if (highlights.length === 0) return ranges;
  const { text, positions } = documentText(doc);
  for (const highlight of highlights) {
    const found = findQuote(text, highlight.anchor);
    if (found)
      ranges.set(highlight.id, {
        from: positions[found.start]!,
        to: positions[found.end - 1]! + 1,
      });
  }
  return ranges;
}

function decorate(
  doc: ProseMirrorNode,
  ranges: Map<string, Range>,
  activeId: string | null,
): DecorationSet {
  return DecorationSet.create(
    doc,
    [...ranges].map(([id, range]) =>
      Decoration.inline(range.from, range.to, {
        class:
          id === activeId
            ? "bb-docs-comment bb-docs-comment-active"
            : "bb-docs-comment",
        "data-comment-id": id,
      }),
    ),
  );
}

export function commentRange(state: EditorState, id: string): Range | null {
  return commentHighlightsKey.getState(state)?.ranges.get(id) ?? null;
}

export function createCommentHighlights(options: {
  onActivate(id: string): void;
  onComment(): boolean;
}) {
  return Extension.create({
    name: "docsCommentHighlights",
    addKeyboardShortcuts() {
      return { "Mod-Alt-m": () => options.onComment() };
    },
    addProseMirrorPlugins() {
      return [
        new Plugin<HighlightState>({
          key: commentHighlightsKey,
          state: {
            init: () => ({
              highlights: [],
              activeId: null,
              ranges: new Map(),
              decorations: DecorationSet.empty,
            }),
            apply(transaction, value, _oldState, state) {
              const meta = transaction.getMeta(commentHighlightsKey) as
                | HighlightMeta
                | undefined;
              if (!meta && !transaction.docChanged) return value;
              const highlights = meta?.highlights ?? value.highlights;
              const activeId =
                meta && "activeId" in meta
                  ? (meta.activeId ?? null)
                  : value.activeId;
              const ranges =
                meta?.highlights || transaction.docChanged
                  ? locate(state.doc, highlights)
                  : value.ranges;
              return {
                highlights,
                activeId,
                ranges,
                decorations: decorate(state.doc, ranges, activeId),
              };
            },
          },
          props: {
            decorations: (state) =>
              commentHighlightsKey.getState(state)?.decorations,
            handleClick(_view, _position, event) {
              const target =
                event.target instanceof Element
                  ? event.target.closest("[data-comment-id]")
                  : null;
              const id = target?.getAttribute("data-comment-id");
              if (id) options.onActivate(id);
              return false;
            },
          },
        }),
      ];
    },
  });
}
