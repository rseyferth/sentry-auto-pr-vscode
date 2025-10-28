import { create } from "zustand";
import * as vscode from "vscode";
import { SentryClient } from "../sentry/client";
import { SentryIssue } from "../sentry/types";

export interface SentryStoreState {
  issuesByProject: Map<string, SentryIssue[]>;
  isLoading: boolean;
  error: string | null;
  refresh: (client: SentryClient | null) => Promise<void>;
  updateIssues: (issuesByProject: Map<string, SentryIssue[]>) => void;
}

export const useSentryStore = create<SentryStoreState>((set) => ({
  issuesByProject: new Map(),
  isLoading: false,
  error: null,

  refresh: async (client: SentryClient | null) => {
    console.log("[SentryStore] refresh called");
    if (!client) {
      console.log("[SentryStore] No client provided, clearing state");
      set({ issuesByProject: new Map(), isLoading: false, error: null });
      return;
    }

    console.log("[SentryStore] Starting fetch...");
    set({ isLoading: true, error: null });

    try {
      const issuesByProject = await client.fetchAllIssues();
      console.log(`[SentryStore] Fetched ${issuesByProject.size} projects`);
      set({ issuesByProject, isLoading: false, error: null });
    } catch (error) {
      console.error("[SentryStore] Error fetching issues:", error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  updateIssues: (issuesByProject: Map<string, SentryIssue[]>) => {
    set({ issuesByProject });
  },
}));
