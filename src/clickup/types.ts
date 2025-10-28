export interface ClickUpConfig {
  apiToken: string;
  teamId: string;
  customFields: Record<string, any>;
  selectedListId?: string;
  completedStatusName: string;
  language: string;
}

export interface ClickUpList {
  id: string;
  name: string;
  folder?: {
    id: string;
    name: string;
  };
  space?: {
    id: string;
    name: string;
  };
  statuses?: {
    id: string;
    status: string;
  }[];
}

export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  status: {
    status: string;
  };
  url: string;
  tags?: Array<{ name: string }>;
  custom_fields?: Array<{
    id: string;
    name: string;
    value: any;
  }>;
}

export interface ClickUpComment {
  id: string;
  comment: Array<{ text: string }>;
  user: {
    username: string;
  };
  date: number;
}
