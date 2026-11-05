import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { sizeListMarkers } from "../lib/list-markers";
const key = new PluginKey<DecorationSet>("list-marker-sizes");
/** Decorations resize markers without adding attributes or history to document JSON. */
export const ListMarkerSizes = Extension.create({
  name: "listMarkerSizes",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const entries = tr.getMeta(key);
            return entries
              ? DecorationSet.create(tr.doc, entries)
              : set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
        view(view) {
          let frame = 0,
            previous = "";
          const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              if (view.isDestroyed) return;
              const entries: Decoration[] = [];
              for (const { element, size, style } of sizeListMarkers(
                view.dom,
                false,
              )) {
                const pos = view.posAtDOM(element, 0) - 1,
                  node = view.state.doc.nodeAt(pos);
                if (node?.type.name === "listItem")
                  entries.push(
                    Decoration.node(
                      pos,
                      pos + node.nodeSize,
                      {
                        style: style,
                        "data-list-gap": "",
                        ...(size !== null
                          ? { "data-list-size": String(size) }
                          : {}),
                      },
                      { markerStyle: style },
                    ),
                  );
              }
              const signature = entries
                .map(
                  (d) =>
                    `${d.from}:${d.to}:${JSON.stringify(d.spec.markerStyle)}`,
                )
                .join("|");
              if (signature !== previous) {
                previous = signature;
                view.dispatch(
                  view.state.tr
                    .setMeta(key, entries)
                    .setMeta("addToHistory", false),
                );
              }
            });
          };
          const resize = new ResizeObserver(update);
          resize.observe(view.dom);
          document.fonts.addEventListener("loadingdone", update);
          update();
          return {
            update,
            destroy() {
              cancelAnimationFrame(frame);
              resize.disconnect();
              document.fonts.removeEventListener("loadingdone", update);
            },
          };
        },
      }),
    ];
  },
});
