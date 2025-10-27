import axios, { AxiosInstance } from "axios";
import { SentryConfig, SentryIssue, SentryEvent } from "./types";

export class SentryClient {
  private axiosInstance: AxiosInstance;
  private config: SentryConfig;

  constructor(config: SentryConfig) {
    this.config = config;
    this.axiosInstance = axios.create({
      baseURL: config.sentryUrl,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }

  /**
   * Fetch issues for all configured projects
   */
  async fetchAllIssues(): Promise<Map<string, SentryIssue[]>> {
    const issuesByProject = new Map<string, SentryIssue[]>();

    for (const projectSlug of this.config.projectSlugs) {
      try {
        const issues = await this.fetchProjectIssues(projectSlug);
        issuesByProject.set(projectSlug, issues);
      } catch (error) {
        console.error(`Failed to fetch issues for ${projectSlug}:`, error);
        issuesByProject.set(projectSlug, []);
      }
    }

    return issuesByProject;
  }

  /**
   * Fetch issues for a specific project
   */
  async fetchProjectIssues(projectSlug: string): Promise<SentryIssue[]> {
    const [org, project] = projectSlug.split("/");

    if (!org || !project) {
      throw new Error(
        `Invalid project slug format: ${projectSlug}. Expected: 'organization/project'`
      );
    }

    try {
      // Try organization endpoint with query parameter
      const response = await this.axiosInstance.get(
        `/api/0/organizations/${org}/issues/`,
        {
          params: {
            statsPeriod: "14d",
            query: `project:${project} is:unresolved`,
            sort: "date",
            limit: 25,
          },
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Sentry API error: ${error.response?.status} ${error.response?.statusText}`
        );
      }
      throw error;
    }
  }

  /**
   * Fetch the latest event for a specific issue
   */
  async fetchLatestEvent(issueId: string): Promise<SentryEvent | null> {
    try {
      const response = await this.axiosInstance.get(
        `/api/0/issues/${issueId}/events/latest/`
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to fetch latest event for issue ${issueId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Test the connection to Sentry
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.axiosInstance.get("/api/0/");
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: SentryConfig): void {
    this.config = config;
    this.axiosInstance = axios.create({
      baseURL: config.sentryUrl,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }

  /**
   * Resolve an issue (mark as resolved in next release)
   */
  async resolveIssue(
    issueId: string,
    status: "resolved" | "resolvedInNextRelease" = "resolvedInNextRelease"
  ): Promise<boolean> {
    try {
      await this.axiosInstance.put(`/api/0/issues/${issueId}/`, {
        status: status,
      });
      return true;
    } catch (error) {
      console.error(`Failed to resolve issue ${issueId}:`, error);
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Sentry API error: ${error.response?.status} ${error.response?.statusText}`
        );
      }
      throw error;
    }
  }
}
