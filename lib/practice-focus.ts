"use client";

import { useSyncExternalStore } from "react";

const key = "clearly.practice-focus.v1";
const eventName = "clearly:practice-focus";

function readFocus(): string | null {
  try {
    return window.localStorage.getItem(key)?.trim().slice(0, 500) || null;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(eventName, listener);
  };
}

function writeFocus(focus: string | null): boolean {
  try {
    if (focus) window.localStorage.setItem(key, focus.trim().slice(0, 500));
    else window.localStorage.removeItem(key);
    window.dispatchEvent(new Event(eventName));
    return true;
  } catch {
    return false;
  }
}

const serverSnapshot = () => null;

// Only the tip the user chooses is stored; recordings and transcripts stay out.
export function usePracticeFocus() {
  const focus = useSyncExternalStore(subscribe, readFocus, serverSnapshot);
  return { focus, saveFocus: writeFocus, clearFocus: () => writeFocus(null) };
}
