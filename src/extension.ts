import * as path from "path";
import * as vscode from "vscode";
import { listProjects, ProjectEntry } from "./sessionScanner";

interface ProjectQuickPickItem extends vscode.QuickPickItem {
  project?: ProjectEntry;
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "cc-looker.openProject",
    openProjectCommand
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {}

async function openProjectCommand(): Promise<void> {
  const quickPick = vscode.window.createQuickPick<ProjectQuickPickItem>();
  quickPick.title = "CC Looker: Claude Code Projects";
  quickPick.placeholder = "Search projects by path or recent session…";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.busy = true;
  quickPick.show();

  try {
    const projects = await listProjects();
    if (projects.length === 0) {
      quickPick.items = [];
      quickPick.placeholder = "No projects found.";
    } else {
      quickPick.items = toQuickPickItems(projects);
    }
  } catch (err) {
    quickPick.hide();
    quickPick.dispose();
    vscode.window.showErrorMessage(
      `CC Looker: failed to load Claude Code sessions — ${
        (err as Error).message
      }`
    );
    return;
  } finally {
    quickPick.busy = false;
  }

  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    quickPick.hide();
    if (!selected?.project) {
      return;
    }
    const openInNewWindow = vscode.workspace
      .getConfiguration("ccLooker")
      .get<boolean>("openInNewWindow", true);
    vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.file(selected.project.cwd),
      { forceNewWindow: openInNewWindow }
    );
  });

  quickPick.onDidHide(() => quickPick.dispose());
}

function toQuickPickItems(projects: ProjectEntry[]): ProjectQuickPickItem[] {
  const items: ProjectQuickPickItem[] = [];
  let lastGroupHadSessions: boolean | null = null;

  for (const project of projects) {
    const hasSessions = project.sessionCount > 0;
    if (hasSessions !== lastGroupHadSessions) {
      items.push({
        label: hasSessions ? "Claude sessions" : "No Claude sessions",
        kind: vscode.QuickPickItemKind.Separator,
      });
      lastGroupHadSessions = hasSessions;
    }
    items.push(toQuickPickItem(project));
  }

  return items;
}

function toQuickPickItem(project: ProjectEntry): ProjectQuickPickItem {
  const name = path.basename(project.cwd) || project.cwd;
  const detailParts: string[] = [];
  if (project.sessionCount > 0) {
    const sessionLabel =
      project.sessionCount === 1
        ? "1 session"
        : `${project.sessionCount} sessions`;
    detailParts.push(sessionLabel);
    if (project.lastActive) {
      detailParts.push(relativeTime(project.lastActive));
    }
  } else {
    detailParts.push("No Claude sessions yet");
  }
  if (project.snippet) {
    detailParts.push(`"${project.snippet}"`);
  }

  return {
    label: `$(folder) ${name}`,
    description: project.cwd,
    detail: detailParts.join(" · "),
    project,
  };
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const units: [string, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  if (diffSec < 60) {
    return "just now";
  }

  for (const [unit, secs] of units) {
    const value = Math.floor(diffSec / secs);
    if (value >= 1) {
      return `${value} ${unit}${value > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}
