import { create } from "zustand";
import { ClickUpClient } from "../clickup/client";
import { ClickUpConfig, ClickUpList } from "../clickup/types";

export interface ClickUpStoreState {
  lists: ClickUpList[];
  selectedListId: string | null;
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  issueTaskMap: Map<string, string>; // Sentry issue ID → ClickUp task URL

  refresh: (
    client: ClickUpClient | null,
    config: ClickUpConfig | null
  ) => Promise<void>;
  selectList: (listId: string | null) => void;
  createTask: (
    client: ClickUpClient,
    listId: string,
    issueId: string,
    issueTitle: string,
    issueUrl: string
  ) => Promise<{ taskId: string; taskUrl: string }>;
  setTaskMapping: (issueId: string, taskUrl: string) => void;
}

export const useClickUpStore = create<ClickUpStoreState>((set, get) => ({
  lists: [],
  selectedListId: null,
  isEnabled: false,
  isLoading: false,
  error: null,
  issueTaskMap: new Map(),

  refresh: async (
    client: ClickUpClient | null,
    config: ClickUpConfig | null
  ) => {
    if (!client || !config) {
      set({
        lists: [],
        selectedListId: config?.selectedListId || null,
        isEnabled: false,
        isLoading: false,
        error: null,
      });
      return;
    }

    set({ isLoading: true, error: null, isEnabled: true });

    try {
      const lists = await client.getLists(config.teamId);
      set({
        lists,
        selectedListId: config.selectedListId || lists[0]?.id || null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  selectList: (listId: string | null) => {
    set({ selectedListId: listId });
  },

  createTask: async (
    client: ClickUpClient,
    listId: string,
    issueId: string,
    issueTitle: string,
    issueUrl: string
  ) => {
    const task = await client.createTask(
      listId,
      `Sentry: ${issueTitle}`,
      `Sentry Issue: ${issueUrl}`,
      ["Sentry AutoFix"]
    );

    set((state) => {
      const newMap = new Map(state.issueTaskMap);
      newMap.set(issueId, task.url);
      return { issueTaskMap: newMap };
    });

    return { taskId: task.id, taskUrl: task.url };
  },

  setTaskMapping: (issueId: string, taskUrl: string) => {
    set((state) => {
      const newMap = new Map(state.issueTaskMap);
      newMap.set(issueId, taskUrl);
      return { issueTaskMap: newMap };
    });
  },
}));
