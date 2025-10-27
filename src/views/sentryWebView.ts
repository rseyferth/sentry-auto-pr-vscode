import * as vscode from "vscode";
import { SentryClient } from "../sentry/client";
import { SentryIssue } from "../sentry/types";

export class SentryWebViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sentryIssuesView";
  private _view?: vscode.WebviewView;
  private issuesByProject: Map<string, SentryIssue[]> = new Map();
  private isLoading: boolean = false;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private sentryClient: SentryClient,
    private context: vscode.ExtensionContext
  ) {
    // Load cached issues on startup
    this.loadFromCache();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Send cached data immediately after webview is ready
    if (this.issuesByProject.size > 0) {
      // Small delay to ensure webview is fully initialized
      setTimeout(() => {
        this.refresh();
      }, 100);
    }

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "fixWithAI": {
          const issue = this.findIssueById(data.issueId);
          if (issue) {
            vscode.commands.executeCommand("sentryAutoFix.fixWithAI", {
              issue,
            });
          }
          break;
        }
        case "openInBrowser": {
          const issue = this.findIssueById(data.issueId);
          if (issue) {
            vscode.env.openExternal(vscode.Uri.parse(issue.permalink));
          }
          break;
        }
        case "refresh": {
          vscode.commands.executeCommand("sentryAutoFix.refreshIssues");
          break;
        }
        case "resolveIssue": {
          const issue = this.findIssueById(data.issueId);
          if (issue) {
            await this.resolveIssue(data.issueId);
          }
          break;
        }
      }
    });
  }

  public async loadIssues(background: boolean = false): Promise<void> {
    try {
      this.isLoading = true;
      if (!background) {
        this.refresh(); // Show loading state immediately
      } else {
        this.sendLoadingState(true);
      }

      this.issuesByProject = await this.sentryClient.fetchAllIssues();

      // Cache the issues
      await this.saveToCache();

      this.isLoading = false;
      this.refresh();
      this.sendLoadingState(false);
    } catch (error) {
      this.isLoading = false;
      this.sendLoadingState(false);

      if (!background) {
        vscode.window.showErrorMessage(
          `Failed to load Sentry issues: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }
  }

  private async resolveIssue(issueId: string): Promise<void> {
    try {
      // Send loading state to webview
      this._view?.webview.postMessage({
        type: "resolveStart",
        issueId,
      });

      await this.sentryClient.resolveIssue(issueId);

      vscode.window.showInformationMessage("✅ Issue resolved in next release");

      // Wait a moment for Sentry to update, then refresh
      setTimeout(async () => {
        await this.loadIssues(false);
        this.refresh();
      }, 1500);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to resolve issue: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async saveToCache(): Promise<void> {
    try {
      const data = this.serializeIssues();
      await this.context.workspaceState.update("sentryIssues", {
        data,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Failed to save cache:", error);
    }
  }

  private async loadFromCache(): Promise<void> {
    try {
      const cached = this.context.workspaceState.get<{
        data: any;
        timestamp: number;
      }>("sentryIssues");

      if (cached && cached.data) {
        // Reconstruct issuesByProject from cached data
        this.issuesByProject = new Map();
        for (const projectData of cached.data) {
          this.issuesByProject.set(projectData.project, projectData.issues);
        }
        this.refresh();
      }
    } catch (error) {
      console.error("Failed to load cache:", error);
    }
  }

  private sendLoadingState(isLoading: boolean): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: "loadingState",
        isLoading,
      });
    }
  }

  public refresh(): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: "updateIssues",
        issues: this.serializeIssues(),
        isLoading: this.isLoading,
      });
    }
  }

  private serializeIssues() {
    const result: { project: string; issues: any[] }[] = [];
    for (const [project, issues] of this.issuesByProject.entries()) {
      result.push({
        project,
        issues: issues.map((issue) => ({
          id: issue.id,
          title: issue.title,
          shortId: issue.shortId,
          level: issue.level,
          count: issue.count,
          userCount: issue.userCount,
          culprit: issue.culprit,
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen,
          permalink: issue.permalink,
          metadata: issue.metadata,
        })),
      });
    }
    return result;
  }

  private findIssueById(issueId: string): SentryIssue | undefined {
    for (const issues of this.issuesByProject.values()) {
      const issue = issues.find((i) => i.id === issueId);
      if (issue) {
        return issue;
      }
    }
    return undefined;
  }

  public getIssueById(issueId: string): SentryIssue | undefined {
    return this.findIssueById(issueId);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "webview.css")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; font-src https://cdnjs.cloudflare.com; script-src 'unsafe-inline' ${webview.cspSource};">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <title>Sentry Issues</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 12px;
    }

    .header {
      margin-bottom: 16px;
    }

    .search-bar {
      width: 100%;
      padding: 8px 12px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .search-bar:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    .filters {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
      align-items: center;
    }

    .filters.single-project .filter-dropdown {
      display: none;
    }

    .sort-select {
      padding: 6px 8px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .sort-select:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    .filter-dropdown {
      position: relative;
    }

    .filter-button {
      padding: 6px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      position: relative;
    }

    .filter-button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .filter-button.loading {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .filter-button .fa-rotate {
      transition: transform 0.3s;
    }

    .filter-button.loading .fa-rotate {
      animation: spin 1s linear infinite;
    }

    .filter-dropdown-content {
      display: none;
      position: absolute;
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
      padding: 8px;
      z-index: 100;
      min-width: 200px;
      margin-top: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .filter-dropdown-content.show {
      display: block;
    }

    .filter-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px;
      cursor: pointer;
    }

    .filter-option:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .filter-option input[type="checkbox"] {
      cursor: pointer;
    }

    .stats {
      font-size: 11px;
      opacity: 0.7;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .loading-indicator {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--vscode-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      opacity: 0.5;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-indicator.hidden {
      display: none;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      opacity: 0.6;
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .issue-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      margin-bottom: 8px;
      transition: all 0.2s;
    }

    .issue-card:hover {
      border-color: var(--vscode-focusBorder);
    }

    .issue-card.expanded {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .issue-header {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
      cursor: pointer;
      user-select: none;
    }

    .issue-header:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .issue-icon {
      flex-shrink: 0;
      font-size: 14px;
      margin-top: 2px;
    }

    .issue-icon.error {
      color: var(--vscode-errorForeground);
    }

    .issue-icon.warning {
      color: var(--vscode-editorWarning-foreground);
    }

    .issue-icon.info {
      color: var(--vscode-notificationsInfoIcon-foreground);
    }

    .issue-icon.resolved {
      color: #28a745;
      font-size: 20px;
    }

    .issue-icon.ignored {
      color: #6c757d;
      font-size: 18px;
    }

    .expand-icon {
      flex-shrink: 0;
      font-size: 10px;
      opacity: 0.5;
      transition: transform 0.2s;
      margin-top: 2px;
    }

    .issue-card.expanded .expand-icon {
      transform: rotate(90deg);
    }

    .issue-content {
      flex: 1;
      min-width: 0;
    }

    .issue-summary {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }

    .issue-id {
      font-size: 10px;
      font-weight: 500;
      font-family: var(--vscode-editor-font-family);
      opacity: 0.7;
      text-transform: uppercase;
    }

    .issue-title {
      font-size: 12px;
      line-height: 1.4;
      opacity: 0.9;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      max-height: calc(1.4em * 3);
      word-wrap: break-word;
    }

    .issue-details {
      display: none;
      padding: 0 12px 12px 12px;
      border-top: 1px solid var(--vscode-panel-border);
      margin-top: 0;
    }

    .issue-card.expanded .issue-details {
      display: block;
    }

    .issue-title-full {
      font-weight: 600;
      margin: 12px 0 8px 0;
      word-wrap: break-word;
    }

    .issue-culprit {
      font-size: 11px;
      opacity: 0.8;
      margin-bottom: 12px;
      font-family: var(--vscode-editor-font-family);
      word-wrap: break-word;
    }

    .issue-meta {
      display: flex;
      gap: 12px;
      font-size: 11px;
      margin-top: 8px;
      opacity: 0.7;
    }

    .issue-meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .issue-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 10px;
    }

    .btn {
      padding: 6px 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
      width: 100%;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-success {
      background: #28a745 !important;
      color: white !important;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .issue-card.resolved {
      opacity: 0.85;
      border-left: 3px solid #28a745;
    }

    .issue-card.resolved .issue-header {
      background: rgba(40, 167, 69, 0.1);
    }

    .issue-card.ignored {
      opacity: 0.6;
      border-left: 3px solid #6c757d;
    }

    .issue-card.ignored .issue-header {
      background: rgba(108, 117, 125, 0.05);
    }

    .project-section {
      margin-bottom: 20px;
    }

    .project-header {
      font-weight: 600;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--vscode-panel-border);
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="header">
    <input type="text" class="search-bar" id="searchInput" placeholder="Search issues..." />
    
    <div class="filters">
      <div class="filter-dropdown">
        <button class="filter-button" id="projectFilterBtn">
          <i class="fas fa-folder"></i> Projects (<span id="projectCount">0</span>)
        </button>
        <div class="filter-dropdown-content" id="projectFilterDropdown">
          <!-- Populated by JS -->
        </div>
      </div>
      
      <select class="sort-select" id="sortSelect">
        <option value="lastSeen">Sort: Last Seen</option>
        <option value="count">Sort: Event Count</option>
        <option value="firstSeen">Sort: First Seen</option>
      </select>

      <button class="filter-button" id="refreshBtn"><i class="fas fa-rotate"></i> Refresh</button>
    </div>

    <div class="stats">
      <div class="loading-indicator hidden" id="loadingIndicator"></div>
      <span id="stats">Loading...</span>
    </div>
  </div>

  <div id="issuesContainer">
    <div class="empty-state">
      <div class="empty-state-icon"><i class="fas fa-bug"></i></div>
      <div>Loading issues...</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    let allIssues = [];
    let filteredProjects = new Set();
    let expandedIssues = new Set();

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'updateIssues') {
        allIssues = message.issues;
        filteredProjects = new Set(allIssues.map(p => p.project));
        updateProjectFilter();
        renderIssues();
        
        // Hide project filter if only one project
        const filtersDiv = document.querySelector('.filters');
        if (allIssues.length === 1) {
          filtersDiv.classList.add('single-project');
        } else {
          filtersDiv.classList.remove('single-project');
        }
      } else if (message.type === 'loadingState') {
        const indicator = document.getElementById('loadingIndicator');
        const refreshBtn = document.getElementById('refreshBtn');
        
        if (message.isLoading) {
          indicator.classList.remove('hidden');
          refreshBtn.classList.add('loading');
          refreshBtn.disabled = true;
        } else {
          indicator.classList.add('hidden');
          refreshBtn.classList.remove('loading');
          refreshBtn.disabled = false;
        }
      } else if (message.type === 'resolveStart') {
        handleResolveStart(message.issueId);
      } else if (message.type === 'resolveSuccess') {
        handleResolveSuccess(message.issueId);
      }
    });

    // Search functionality
    document.getElementById('searchInput').addEventListener('input', (e) => {
      renderIssues();
    });

    // Sort functionality
    document.getElementById('sortSelect').addEventListener('change', (e) => {
      renderIssues();
    });

    // Project filter
    document.getElementById('projectFilterBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('projectFilterDropdown');
      dropdown.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      document.getElementById('projectFilterDropdown').classList.remove('show');
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (!btn.classList.contains('loading')) {
        vscode.postMessage({ type: 'refresh' });
      }
    });

    function updateProjectFilter() {
      const dropdown = document.getElementById('projectFilterDropdown');
      dropdown.innerHTML = '';
      
      allIssues.forEach(projectData => {
        const option = document.createElement('div');
        option.className = 'filter-option';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = filteredProjects.has(projectData.project);
        checkbox.id = 'proj-' + projectData.project;
        
        const label = document.createElement('label');
        label.textContent = projectData.project + ' (' + projectData.issues.length + ')';
        label.htmlFor = checkbox.id;
        label.style.cursor = 'pointer';
        
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            filteredProjects.add(projectData.project);
          } else {
            filteredProjects.delete(projectData.project);
          }
          renderIssues();
        });
        
        option.appendChild(checkbox);
        option.appendChild(label);
        dropdown.appendChild(option);
      });

      document.getElementById('projectCount').textContent = filteredProjects.size;
    }

    function renderIssues() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      const sortBy = document.getElementById('sortSelect').value;
      const container = document.getElementById('issuesContainer');
      
      let totalIssues = 0;
      let totalEvents = 0;
      let html = '';

      const filtered = allIssues.filter(p => filteredProjects.has(p.project));

      if (filtered.length === 0) {
        html = '<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-folder-open"></i></div><div>No projects selected</div></div>';
      } else {
        filtered.forEach(projectData => {
          let issues = projectData.issues.filter(issue => {
            if (!searchTerm) return true;
            return issue.title.toLowerCase().includes(searchTerm) ||
                   issue.shortId.toLowerCase().includes(searchTerm) ||
                   (issue.culprit && issue.culprit.toLowerCase().includes(searchTerm));
          });

          // Sort issues
          issues = sortIssues(issues, sortBy);

          if (issues.length > 0) {
            totalIssues += issues.length;
            
            html += '<div class="project-section">';
            html += '<div class="project-header"><i class="fas fa-box"></i> ' + escapeHtml(projectData.project) + '</div>';
            
            issues.forEach(issue => {
              totalEvents += parseInt(issue.count) || 0;
              html += renderIssueCard(issue);
            });
            
            html += '</div>';
          }
        });

        if (html === '' && searchTerm) {
          html = '<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-magnifying-glass"></i></div><div>No issues found matching "' + escapeHtml(searchTerm) + '"</div></div>';
        }
      }

      container.innerHTML = html;
      
      // Update stats
      if (totalIssues > 0) {
        document.getElementById('stats').textContent = 
          totalIssues + ' issue' + (totalIssues !== 1 ? 's' : '') + 
          ' • ' + totalEvents.toLocaleString() + ' total events';
      } else {
        document.getElementById('stats').textContent = 'No issues to display';
      }

      // Add event listeners
      document.querySelectorAll('.issue-header').forEach(header => {
        header.addEventListener('click', (e) => {
          // Don't toggle if clicking on a button
          if (e.target.tagName === 'BUTTON') return;
          
          const card = header.closest('.issue-card');
          const issueId = card.dataset.issueId;
          
          if (expandedIssues.has(issueId)) {
            expandedIssues.delete(issueId);
            card.classList.remove('expanded');
          } else {
            expandedIssues.add(issueId);
            card.classList.add('expanded');
          }
        });
      });

      document.querySelectorAll('.btn-fix').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'fixWithAI', issueId: btn.dataset.issueId });
        });
      });

      document.querySelectorAll('.btn-open').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'openInBrowser', issueId: btn.dataset.issueId });
        });
      });

      document.querySelectorAll('.btn-resolve').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'resolveIssue', issueId: btn.dataset.issueId });
        });
      });
    }

    function handleResolveStart(issueId) {
      const btn = document.querySelector(\`.btn-resolve[data-issue-id="\${issueId}"]\`);
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resolving...';
      }
    }

    function handleResolveSuccess(issueId) {
      // Issues will be refreshed from server, so just wait for the update
      // The re-render will happen when updateIssues message arrives
    }

    function sortIssues(issues, sortBy) {
      const sorted = [...issues];
      
      switch (sortBy) {
        case 'lastSeen':
          sorted.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
          break;
        case 'firstSeen':
          sorted.sort((a, b) => new Date(b.firstSeen) - new Date(a.firstSeen));
          break;
        case 'count':
          sorted.sort((a, b) => parseInt(b.count) - parseInt(a.count));
          break;
      }
      
      return sorted;
    }

    function renderIssueCard(issue) {
      // Check if issue is resolved based on status from API
      const isResolved = issue.status === 'resolved';
      const isIgnored = issue.status === 'ignored';
      
      // Use green check icon for resolved issues, gray for ignored, otherwise use level icon
      let displayIcon;
      let iconClass;
      if (isResolved) {
        displayIcon = '<i class="fas fa-circle-check"></i>';
        iconClass = 'resolved';
      } else if (isIgnored) {
        displayIcon = '<i class="fas fa-eye-slash"></i>';
        iconClass = 'ignored';
      } else {
        const levelIcon = {
          'fatal': '<i class="fas fa-skull-crossbones"></i>',
          'error': '<i class="fas fa-circle-exclamation"></i>',
          'warning': '<i class="fas fa-triangle-exclamation"></i>',
          'info': '<i class="fas fa-circle-info"></i>',
          'debug': '<i class="fas fa-bug"></i>'
        }[issue.level] || '<i class="fas fa-bug"></i>';
        displayIcon = levelIcon;
        iconClass = issue.level;
      }

      const lastSeen = new Date(issue.lastSeen).toLocaleString();
      const isExpanded = expandedIssues.has(issue.id);
      const statusClass = isResolved ? 'resolved' : (isIgnored ? 'ignored' : '');
      
      return \`
        <div class="issue-card \${isExpanded ? 'expanded' : ''} \${statusClass}" data-issue-id="\${issue.id}">
          <div class="issue-header">
            <div class="expand-icon"><i class="fas fa-chevron-right"></i></div>
            <div class="issue-icon \${iconClass}">\${displayIcon}</div>
            <div class="issue-content">
              <div class="issue-summary">
                <div class="issue-id">\${escapeHtml(issue.shortId)}</div>
                <div class="issue-title">\${escapeHtml(issue.title)}</div>
              </div>
            </div>
          </div>
          
          <div class="issue-details">
            <div class="issue-title-full">\${escapeHtml(issue.title)}</div>
            \${issue.culprit ? '<div class="issue-culprit"><i class="fas fa-location-dot"></i> ' + escapeHtml(issue.culprit) + '</div>' : ''}
            
            <div class="issue-meta">
              <div class="issue-meta-item"><i class="fas fa-chart-simple"></i> \${issue.count} events</div>
              <div class="issue-meta-item"><i class="fas fa-users"></i> \${issue.userCount} users</div>
              <div class="issue-meta-item"><i class="fas fa-clock"></i> \${lastSeen}</div>
            </div>

            <div class="issue-actions">
              <button class="btn btn-primary btn-fix" data-issue-id="\${issue.id}">
                <i class="fas fa-wand-magic-sparkles"></i> Fix with AI
              </button>
              <button class="btn btn-secondary btn-open" data-issue-id="\${issue.id}">
                <i class="fas fa-arrow-up-right-from-square"></i> Open in Sentry
              </button>
              <button class="btn btn-secondary btn-resolve" data-issue-id="\${issue.id}" \${isResolved || isIgnored ? 'disabled' : ''}>
                <i class="fas fa-check-circle"></i> \${isResolved ? 'Resolved!' : (isIgnored ? 'Ignored' : 'Resolve in Next Release')}
              </button>
            </div>
          </div>
        </div>
      \`;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Request initial data
    vscode.postMessage({ type: 'refresh' });
  </script>
</body>
</html>`;
  }
}
