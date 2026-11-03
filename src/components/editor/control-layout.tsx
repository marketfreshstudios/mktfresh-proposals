"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
export const ControlLayout = createContext({
  desktop: false,
  phone: false,
  locked: false,
  compact: false,
  map: {} as Record<string, string>,
  onField: undefined as undefined | (() => void),
});
export function useControlLayout() {
  return useContext(ControlLayout);
}
export const BlockDragHandle = createContext<ReactNode>(null);
export function useDesktopControls() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = matchMedia("(min-width:700px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}
