"use client";

import { useEffect } from "react";
import { ensureActiveChatSession, useChatStore } from "@/store/chat-store";

export function useChatStoreHydration() {
  useEffect(() => {
    const unsubscribe =
      useChatStore.persist.onFinishHydration(ensureActiveChatSession);

    if (useChatStore.persist.hasHydrated()) ensureActiveChatSession();
    else void useChatStore.persist.rehydrate();

    return unsubscribe;
  }, []);
}
