import React, { useState, useMemo } from "react";
import { IssueCard } from "./IssueCard";
import { ClickUpDropdown } from "./ClickUpDropdown";
import { SentryIssue } from "../../sentry/types";
import { ClickUpList } from "../../clickup/types";

interface IssueListProps {
  issuesByProject: Map<string, SentryIssue[]>;
  clickUpLists: ClickUpList[];
  clickUpSelectedListId: string | null;
  clickUpEnabled: boolean;
  issueTaskMap: Map<string, string>;
  onCreateClickUpTask: (
    issueId: string,
    issueTitle: string,
    issueUrl: string
  ) => void;
  onSelectClickUpList: (listId: string | null) => void;
  searchTerm: string;
  sortBy: string;
  filteredProjects: Set<string>;
}

export const IssueList: React.FC<IssueListProps> = ({
  issuesByProject,
  clickUpLists,
  clickUpSelectedListId,
  clickUpEnabled,
  issueTaskMap,
  onCreateClickUpTask,
  onSelectClickUpList,
  searchTerm,
  sortBy,
  filteredProjects,
}) => {
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  // Convert Map to array for rendering
  const projectsArray = useMemo(() => {
    return Array.from(issuesByProject.entries()).map(([project, issues]) => ({
      project,
      issues,
    }));
  }, [issuesByProject]);

  const filteredProjectsArray = useMemo(() => {
    return projectsArray.filter((p) => filteredProjects.has(p.project));
  }, [projectsArray, filteredProjects]);

  const handleToggleIssue = (issueId: string) => {
    setExpandedIssues((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(issueId)) {
        newSet.delete(issueId);
      } else {
        newSet.add(issueId);
      }
      return newSet;
    });
  };

  const sortIssues = (issues: SentryIssue[], sortBy: string) => {
    const sorted = [...issues];
    switch (sortBy) {
      case "lastSeen":
        sorted.sort(
          (a, b) =>
            new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
        );
        break;
      case "firstSeen":
        sorted.sort(
          (a, b) =>
            new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime()
        );
        break;
      case "count":
        sorted.sort((a, b) => parseInt(b.count) - parseInt(a.count));
        break;
    }
    return sorted;
  };

  const filterAndSortIssues = (issues: SentryIssue[]) => {
    let filtered = issues;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = issues.filter(
        (issue) =>
          issue.title.toLowerCase().includes(term) ||
          issue.shortId.toLowerCase().includes(term) ||
          (issue.culprit && issue.culprit.toLowerCase().includes(term))
      );
    }

    return sortIssues(filtered, sortBy);
  };

  const stats = useMemo(() => {
    let totalIssues = 0;
    let totalEvents = 0;

    filteredProjectsArray.forEach((projectData) => {
      const issues = filterAndSortIssues(projectData.issues);
      totalIssues += issues.length;
      issues.forEach((issue) => {
        totalEvents += parseInt(issue.count) || 0;
      });
    });

    return { totalIssues, totalEvents };
  }, [filteredProjectsArray, searchTerm, sortBy]);

  if (projectsArray.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <i className="fas fa-bug"></i>
        </div>
        <div>Loading issues...</div>
      </div>
    );
  }

  if (filteredProjectsArray.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <i className="fas fa-folder-open"></i>
        </div>
        <div>No projects selected</div>
      </div>
    );
  }

  const hasResults = filteredProjectsArray.some(
    (p) => filterAndSortIssues(p.issues).length > 0
  );

  if (!hasResults) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <i className="fas fa-magnifying-glass"></i>
        </div>
        <div>No issues found matching &quot;{searchTerm}&quot;</div>
      </div>
    );
  }

  return (
    <div>
      {filteredProjectsArray.map((projectData) => {
        const issues = filterAndSortIssues(projectData.issues);
        if (issues.length === 0) return null;

        return (
          <div key={projectData.project} className="project-section">
            <div className="project-header">
              <i className="fas fa-box"></i> {projectData.project}
            </div>
            {issues.map((issue) => {
              const clickUpTaskUrl = issueTaskMap.get(issue.id);
              return (
                <IssueCard
                  key={issue.id}
                  issue={{ ...issue, project: projectData.project }}
                  isExpanded={expandedIssues.has(issue.id)}
                  onToggle={() => handleToggleIssue(issue.id)}
                  onClickUpTask={() =>
                    onCreateClickUpTask(issue.id, issue.title, issue.permalink)
                  }
                  onClickUpTaskUrl={clickUpTaskUrl}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
