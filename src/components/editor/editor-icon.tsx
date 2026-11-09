import {
  Copy,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";

const icons = {
  undo: Undo2,
  redo: Redo2,
  "list-bulleted": List,
  "list-numbered": ListOrdered,
  link: Link2,
  duplicate: Copy,
  trash: Trash2,
};

export function EditorIcon({
  name,
  size = 16,
}: {
  name: keyof typeof icons;
  size?: number;
}) {
  const Glyph = icons[name];
  return <Glyph size={size} aria-hidden="true" />;
}
