import React from "react";
import { ClickUpList } from "../../clickup/types";

interface HeaderProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  projects: { project: string; issues: any[] }[];
  filteredProjects: Set<string>;
  onToggleProject: (project: string) => void;
  isLoading: boolean;
  stats: { totalIssues: number; totalEvents: number };
  clickUpEnabled?: boolean;
  clickUpLists?: any[];
  clickUpSelectedListId?: string | null;
  onSelectClickUpList?: (listId: string | null) => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchTerm,
  onSearchChange,
  sortBy,
  onSortChange,
  projects,
  filteredProjects,
  onToggleProject,
  isLoading,
  stats,
  clickUpEnabled,
  clickUpLists,
  clickUpSelectedListId,
  onSelectClickUpList,
}) => {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  return (
    <div className="header">
      <input
        type="text"
        className="search-bar"
        placeholder="Search issues..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <div className="filters">
        {projects.length > 1 && (
          <div className="filter-dropdown">
            <button
              className="filter-button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <i className="fas fa-folder"></i> Projects (
              {filteredProjects.size})
            </button>
            <div
              className={`filter-dropdown-content ${
                dropdownOpen ? "show" : ""
              }`}
            >
              {projects.map((projectData) => (
                <div key={projectData.project} className="filter-option">
                  <input
                    type="checkbox"
                    id={`proj-${projectData.project}`}
                    checked={filteredProjects.has(projectData.project)}
                    onChange={() => onToggleProject(projectData.project)}
                  />
                  <label
                    htmlFor={`proj-${projectData.project}`}
                    style={{ cursor: "pointer" }}
                  >
                    {projectData.project} ({projectData.issues.length})
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
        >
          <option value="lastSeen">Sort: Last Seen</option>
          <option value="count">Sort: Event Count</option>
          <option value="firstSeen">Sort: First Seen</option>
        </select>

        {clickUpEnabled &&
          clickUpLists &&
          clickUpLists.length > 0 &&
          onSelectClickUpList && (
            <div className="clickup-dropdown-wrapper">
              <select
                className="clickup-dropdown"
                value={clickUpSelectedListId || ""}
                onChange={(e) => onSelectClickUpList(e.target.value || null)}
              >
                <option value="">Select ClickUp List...</option>
                {clickUpLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>
          )}
      </div>

      <div className="stats">
        <div className={`loading-indicator ${isLoading ? "" : "hidden"}`}></div>
        <span>
          {stats.totalIssues > 0
            ? `${stats.totalIssues} issue${
                stats.totalIssues !== 1 ? "s" : ""
              } • ${stats.totalEvents.toLocaleString()} total events`
            : "No issues to display"}
        </span>
      </div>
    </div>
  );
};
