import axios, { AxiosInstance } from "axios";
import {
  ClickUpConfig,
  ClickUpList,
  ClickUpTask,
  ClickUpComment,
} from "./types";
import { simpleMarkdownToClickUp } from "./markdownToClickUp";

export class ClickUpClient {
  private axiosInstance: AxiosInstance;
  private config: ClickUpConfig;

  constructor(config: ClickUpConfig) {
    this.config = config;

    // Trim token to remove any whitespace
    const token = config.apiToken?.trim() || "";

    // Log for debugging (without exposing the full token)
    const tokenPreview = token ? `${token.substring(0, 10)}...` : "MISSING";
    console.error(`[ClickUp Client] Initializing with token: ${tokenPreview}`);
    console.error(`[ClickUp Client] Token length: ${token.length}`);

    this.axiosInstance = axios.create({
      baseURL: "https://api.clickup.com/api/v2",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    // Add request interceptor to debug the actual request being made
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.error("[ClickUp Client] Making request to:", config.url);
        console.error("[ClickUp Client] Method:", config.method);
        console.error(
          "[ClickUp Client] Has Authorization header:",
          !!config.headers.Authorization
        );
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor to debug errors
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error("[ClickUp Client] Request failed:");
        console.error("[ClickUp Client] URL:", error.config?.url);
        console.error("[ClickUp Client] Status:", error.response?.status);
        console.error(
          "[ClickUp Client] Status Text:",
          error.response?.statusText
        );
        console.error(
          "[ClickUp Client] Error Data:",
          JSON.stringify(error.response?.data)
        );
        return Promise.reject(error);
      }
    );
  }

  /**
   * Update configuration
   */
  updateConfig(config: ClickUpConfig): void {
    this.config = config;

    // Trim token to remove any whitespace
    const token = config.apiToken?.trim() || "";

    // Log for debugging (without exposing the full token)
    const tokenPreview = token ? `${token.substring(0, 10)}...` : "MISSING";
    console.error(
      `[ClickUp Client] Updating config with token: ${tokenPreview}`
    );
    console.error(`[ClickUp Client] Token length: ${token.length}`);

    this.axiosInstance = axios.create({
      baseURL: "https://api.clickup.com/api/v2",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    // Add request interceptor to debug the actual request being made
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.error("[ClickUp Client] Making request to:", config.url);
        console.error("[ClickUp Client] Method:", config.method);
        console.error(
          "[ClickUp Client] Has Authorization header:",
          !!config.headers.Authorization
        );
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor to debug errors
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error("[ClickUp Client] Request failed:");
        console.error("[ClickUp Client] URL:", error.config?.url);
        console.error("[ClickUp Client] Status:", error.response?.status);
        console.error(
          "[ClickUp Client] Status Text:",
          error.response?.statusText
        );
        console.error(
          "[ClickUp Client] Error Data:",
          JSON.stringify(error.response?.data)
        );
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get all lists from spaces in the team
   */
  async getLists(teamId: string): Promise<ClickUpList[]> {
    try {
      const response = await this.axiosInstance.get(
        `/team/${teamId}/space?archived=false`
      );

      const spaces = response.data.spaces || [];
      const lists: ClickUpList[] = [];

      // Fetch folders in each space
      for (const space of spaces) {
        const foldersResponse = await this.axiosInstance.get(
          `/space/${space.id}/folder?archived=false`
        );
        const folders = foldersResponse.data.folders || [];

        // For each folder, get its lists
        for (const folder of folders) {
          const listsResponse = await this.axiosInstance.get(
            `/folder/${folder.id}/list?archived=false`
          );
          const folderLists = (listsResponse.data.lists || []).map(
            (list: any) => ({
              ...list,
              folder: { id: folder.id, name: folder.name },
              space: { id: space.id, name: space.name },
            })
          );
          lists.push(...folderLists);
        }

        // Also get space-level lists (not in folders)
        const spaceListsResponse = await this.axiosInstance.get(
          `/space/${space.id}/list?archived=false`
        );
        const spaceLists = (spaceListsResponse.data.lists || []).map(
          (list: any) => ({
            ...list,
            space: { id: space.id, name: space.name },
          })
        );
        lists.push(...spaceLists);
      }

      return lists;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `ClickUp API error: ${error.response?.status} ${error.response?.statusText}`
        );
      }
      throw error;
    }
  }

  /**
   * Create a task in a list
   */
  async createTask(
    listId: string,
    taskName: string,
    description: string,
    tags: string[] = []
  ): Promise<ClickUpTask> {
    try {
      const payload: any = {
        name: taskName,
        description,
        tags: tags.map((tag) => ({ name: tag })),
      };

      // Add custom fields if configured
      if (Object.keys(this.config.customFields).length > 0) {
        payload.custom_fields = Object.entries(this.config.customFields).map(
          ([key, value]) => ({
            id: key,
            value: value,
          })
        );
      }

      const response = await this.axiosInstance.post(
        `/list/${listId}/task`,
        payload
      );

      return {
        id: response.data.id,
        name: response.data.name,
        description: response.data.description,
        status: response.data.status,
        url: response.data.url,
        tags: response.data.tags,
        custom_fields: response.data.custom_fields,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `ClickUp API error: ${error.response?.status} ${error.response?.statusText}`
        );
      }
      throw error;
    }
  }

  /**
   * Add a comment to a task
   * ClickUp uses a structured format for rich text comments
   * This method converts markdown to ClickUp's comment format
   */
  async addComment(taskId: string, comment: string): Promise<ClickUpComment> {
    try {
      // Convert markdown to ClickUp's structured comment format
      const structuredComment = simpleMarkdownToClickUp(comment);

      // Add footer to all comments
      structuredComment.push(
        { text: "\n\n" },
        { text: "---\n" },
        { text: "Automatically generated by AI", attributes: { italic: true } }
      );

      console.error("[ClickUp Client] Converting comment to ClickUp format");
      console.error(
        "[ClickUp Client] Structured comment:",
        JSON.stringify(structuredComment, null, 2)
      );

      const response = await this.axiosInstance.post(
        `/task/${taskId}/comment`,
        {
          comment: structuredComment,
          assignee: "",
          notify_all: false,
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data;
        console.error("[ClickUp Client] Comment API error:", errorData);
        throw new Error(
          `ClickUp API error: ${error.response?.status} ${
            error.response?.statusText
          }. Error: ${JSON.stringify(errorData)}`
        );
      }
      throw error;
    }
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    statusName: string = this.config.completedStatusName
  ): Promise<void> {
    try {
      console.error(
        `[ClickUp Client] updateTaskStatus called with taskId: ${taskId}`
      );

      // First, get the task to find available statuses
      // Include custom_task_ids and subtasks to get complete status information
      console.error(`[ClickUp Client] Fetching task: GET /task/${taskId}`);
      const taskResponse = await this.axiosInstance.get(`/task/${taskId}`, {
        params: {
          custom_task_ids: true,
          include_subtasks: false,
        },
      });
      const task = taskResponse.data;
      console.error(`[ClickUp Client] Task fetched successfully`);

      // Log the task structure for debugging
      console.error(
        "[ClickUp Client] Task structure:",
        JSON.stringify(
          {
            hasList: !!task.list,
            hasStatuses: !!task.statuses,
            hasListStatuses: !!(task.list && task.list.statuses),
            currentStatus: task.status,
            listStatuses: task.list?.statuses,
            taskStatuses: task.statuses,
            taskStatusesLength: task.statuses?.length || 0,
          },
          null,
          2
        )
      );

      // Log full task object to debug status availability
      console.error("[ClickUp Client] Full task response (excerpt):", {
        id: task.id,
        name: task.name,
        status: task.status,
        statuses: task.statuses,
        list: task.list
          ? {
              id: task.list.id,
              name: task.list.name,
              statuses: task.list.statuses,
            }
          : null,
      });

      // Get available statuses - try multiple sources
      let availableStatuses: any[] = [];

      // Try 1: Check if task.list.statuses exists (often included in task response)
      if (task.list?.statuses && task.list.statuses.length > 0) {
        availableStatuses = task.list.statuses;
        console.error(
          "[ClickUp Client] Using task.list.statuses:",
          availableStatuses.length
        );
      }
      // Try 2: Check if task.statuses exists
      else if (task.statuses && task.statuses.length > 0) {
        availableStatuses = task.statuses;
        console.error(
          "[ClickUp Client] Using task.statuses:",
          availableStatuses.length
        );
      }
      // Try 3: Fallback to fetching the list (may fail with OAUTH_023 but worth trying)
      else if (task.list && task.list.id) {
        try {
          console.error(
            `[ClickUp Client] No statuses in task response, attempting to fetch list: GET /list/${task.list.id}`
          );
          const listResponse = await this.axiosInstance.get(
            `/list/${task.list.id}`
          );
          availableStatuses = listResponse.data.statuses || [];
          console.error(
            "[ClickUp Client] Fetched list statuses:",
            availableStatuses.length
          );
        } catch (listError) {
          console.error(
            "[ClickUp Client] Could not fetch list (may lack permissions):",
            listError instanceof Error ? listError.message : listError
          );
        }
      }

      // Last resort: use current status only
      if (availableStatuses.length === 0 && task.status) {
        console.error(
          "[ClickUp Client] Using current status as last resort - this means we can't change status!"
        );
        availableStatuses = [
          {
            id: task.status.id,
            status: task.status.status,
            type: task.status.type,
          },
        ];
      }

      // Try to find the status by name (case-insensitive)
      const status = availableStatuses.find(
        (s: any) => s.status.toLowerCase() === statusName.toLowerCase()
      );

      if (!status) {
        const statusNames = availableStatuses
          .map((s: any) => s.status)
          .join(", ");
        console.error("[ClickUp Client] Available statuses:", statusNames);

        // Include diagnostic info in the error message for visibility
        const diagnostics = {
          requestedStatus: statusName,
          availableStatuses: availableStatuses.map((s) => ({
            status: s.status,
            id: s.id,
          })),
          taskHasStatuses: !!task.statuses,
          taskHasListStatuses: !!task.list?.statuses,
          statusSource: task.list?.statuses
            ? "task.list.statuses"
            : task.statuses
            ? "task.statuses"
            : "fallback/unknown",
        };

        throw new Error(
          `Status "${statusName}" not found. Available statuses: ${
            statusNames || "none found"
          }. Diagnostics: ${JSON.stringify(diagnostics, null, 2)}`
        );
      }

      console.error("[ClickUp Client] Found status:", status);

      // Update the task status - ClickUp API expects just the status name as a string
      const updatePayload: any = {
        status: statusName,
      };

      console.error(
        "[ClickUp Client] Update payload:",
        JSON.stringify(updatePayload, null, 2)
      );

      console.error(
        `[ClickUp Client] Updating task status: PUT /task/${taskId}`
      );
      await this.axiosInstance.put(`/task/${taskId}`, updatePayload, {
        params: {
          custom_task_ids: true,
          team_id: this.config.teamId,
        },
      });
      console.error(`[ClickUp Client] Task status updated successfully`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg =
          error.response?.data?.message || error.response?.statusText;
        const errorCode =
          error.response?.data?.ECODE || error.response?.data?.err;
        const errorDetails = JSON.stringify(error.response?.data);

        console.error("[ClickUp Client] Status update failed with details:");
        console.error("[ClickUp Client] Error code:", errorCode);
        console.error("[ClickUp Client] Error message:", errorMsg);
        console.error("[ClickUp Client] Full error data:", errorDetails);

        throw new Error(
          `ClickUp API error: ${error.response?.status} ${errorMsg}. Error code: ${errorCode}. Details: ${errorDetails}`
        );
      }
      throw error;
    }
  }

  /**
   * Get task details
   */
  async getTask(taskId: string): Promise<ClickUpTask> {
    try {
      const response = await this.axiosInstance.get(`/task/${taskId}`);

      return {
        id: response.data.id,
        name: response.data.name,
        description: response.data.description,
        status: response.data.status,
        url: response.data.url,
        tags: response.data.tags,
        custom_fields: response.data.custom_fields,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `ClickUp API error: ${error.response?.status} ${error.response?.statusText}`
        );
      }
      throw error;
    }
  }
}
