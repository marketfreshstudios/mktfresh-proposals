/**
 * Listen for a press anywhere in the document, in the capture phase.
 *
 * A mouse press acts on pointerdown. A touch press acts on its click instead:
 * iOS holds a tap as a hover preview when content appears between the touch
 * and the click, so closing a selection (which can bring the phone dock back)
 * must wait for the click.
 */
export function listenOutsidePress(handler: (event: Event) => void) {
  const down = (event: PointerEvent) => {
    if (event.pointerType === "mouse") handler(event);
  };
  const click = (event: MouseEvent) => {
    if ((event as PointerEvent).pointerType !== "mouse") handler(event);
  };
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("click", click, true);
  return () => {
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("click", click, true);
  };
}
