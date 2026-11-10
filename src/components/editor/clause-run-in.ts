import { Mark } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

/** Clause labels use bold marks without enabling rich formatting or Markdown rules. */
export const ClauseRunIn = Mark.create({
  name: "bold",
  parseHTML: () => [{ tag: "strong" }, { tag: "b" }],
  renderHTML: () => ["strong", 0],
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _previous, state) {
          if (!transactions.some((transaction) => transaction.docChanged))
            return null;
          const delimiters: { start: number; end: number }[] = [];
          state.doc.descendants((node, pos) => {
            if (node.isText)
              for (const match of node.text!.matchAll(/\*+/g)) {
                const start = pos + match.index!;
                delimiters.push({ start, end: start + match[0].length });
              }
          });
          if (!delimiters.length) return null;
          const tr = state.tr;
          for (const { start, end } of delimiters.reverse())
            tr.delete(start, end);
          return tr;
        },
      }),
    ];
  },
});
