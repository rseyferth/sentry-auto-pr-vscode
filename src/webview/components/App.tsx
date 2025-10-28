import React, { useEffect } from "react";
import { Header } from "./Header";
import { IssueList } from "./IssueList";

interface AppProps {
  issuesByProject: Map<string, any[]>;
  isLoading: boolean;
  clickUpEnabled: boolean;
  clickUpLists: any[];
  clickUpSelectedListId: string | null;
  issueTaskMap: Map<string, string>;
  stats: { totalIssues: number; totalEvents: number };
  onCreateClickUpTask: (
    issueId: string,
    issueTitle: string,
    issueUrl: string
  ) => void;
  onSelectClickUpList: (listId: string | null) => void;
}

export const App: React.FC<AppProps> = (props) => {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortBy, setSortBy] = React.useState("lastSeen");
  const [projects, setProjects] = React.useState<
    { project: string; issues: any[] }[]
  >([]);
  const [filteredProjects, setFilteredProjects] = React.useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    const projectsArray = Array.from(props.issuesByProject.entries()).map(
      ([project, issues]) => ({ project, issues })
    );
    setProjects(projectsArray);
    setFilteredProjects(new Set(projectsArray.map((p) => p.project)));
  }, [props.issuesByProject]);

  const handleToggleProject = (project: string) => {
    setFilteredProjects((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(project)) {
        newSet.delete(project);
      } else {
        newSet.add(project);
      }
      return newSet;
    });
  };

  const stats = React.useMemo(() => {
    let totalIssues = 0;
    let totalEvents = 0;

    projects
      .filter((p) => filteredProjects.has(p.project))
      .forEach((projectData) => {
        let issues = projectData.issues;
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          issues = issues.filter(
            (issue) =>
              issue.title.toLowerCase().includes(term) ||
              issue.shortId.toLowerCase().includes(term) ||
              (issue.culprit && issue.culprit.toLowerCase().includes(term))
          );
        }

        switch (sortBy) {
          case "lastSeen":
            issues = issues.sort(
              (a, b) =>
                new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
            );
            break;
          case "firstSeen":
            issues = issues.sort(
              (a, b) =>
                new Date(b.firstSeen).getTime() -
                new Date(a.firstSeen).getTime()
            );
            break;
          case "count":
            issues = issues.sort(
              (a, b) => parseInt(b.count) - parseInt(a.count)
            );
            break;
        }

        totalIssues += issues.length;
        issues.forEach((issue) => {
          totalEvents += parseInt(issue.count) || 0;
        });
      });

    return { totalIssues, totalEvents };
  }, [projects, filteredProjects, searchTerm, sortBy]);

  return (
    <div>
      <Header
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        sortBy={sortBy}
        onSortChange={setSortBy}
        projects={projects}
        filteredProjects={filteredProjects}
        onToggleProject={handleToggleProject}
        isLoading={props.isLoading}
        stats={stats}
        clickUpEnabled={props.clickUpEnabled}
        clickUpLists={props.clickUpLists}
        clickUpSelectedListId={props.clickUpSelectedListId}
        onSelectClickUpList={props.onSelectClickUpList}
      />
      <IssueList
        issuesByProject={props.issuesByProject}
        clickUpLists={props.clickUpLists}
        clickUpSelectedListId={props.clickUpSelectedListId}
        clickUpEnabled={props.clickUpEnabled}
        issueTaskMap={props.issueTaskMap}
        onCreateClickUpTask={props.onCreateClickUpTask}
        onSelectClickUpList={props.onSelectClickUpList}
        searchTerm={searchTerm}
        sortBy={sortBy}
        filteredProjects={filteredProjects}
      />
    </div>
  );
};
