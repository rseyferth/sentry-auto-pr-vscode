export interface SentryConfig {
  sentryUrl: string;
  apiToken: string;
  projectSlugs: string[];
}

export interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  permalink: string;
  shortId: string;
  level: "error" | "warning" | "info" | "fatal" | "debug";
  status: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  metadata: {
    type?: string;
    value?: string;
    filename?: string;
  };
  clickupTaskUrl?: string;
}

export interface SentryEvent {
  id: string;
  message: string;
  platform: string;
  tags: Array<{ key: string; value: string }>;
  dateCreated: string;
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  };
  contexts?: Record<string, any>;
  entries: Array<{
    type: string;
    data: any;
  }>;
  breadcrumbs?: {
    values: Array<{
      timestamp: string;
      type: string;
      category: string;
      message?: string;
      level: string;
      data?: Record<string, any>;
    }>;
  };
}

export interface StackFrame {
  filename: string;
  absPath?: string;
  function: string;
  module?: string;
  lineNo?: number;
  colNo?: number;
  context?: Array<[number, string]>;
  inApp: boolean;
}

export interface StackTrace {
  frames: StackFrame[];
}

export interface ExceptionValue {
  type: string;
  value: string;
  mechanism?: {
    type: string;
    handled: boolean;
  };
  stacktrace?: StackTrace;
}
