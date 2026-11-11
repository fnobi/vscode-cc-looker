import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import * as vscode from "vscode";

export interface ProjectEntry {
  cwd: string;
  dirName: string;
  sessionCount: number;
  lastActive: Date;
  snippet: string;
}

const MAX_LINES_TO_SCAN = 200;

export function resolveProjectsRoot(): string {
  const configured = vscode.workspace
    .getConfiguration("ccLooker")
    .get<string>("claudeProjectsPath", "");
  if (configured && configured.trim().length > 0) {
    return expandHome(configured.trim());
  }
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  if (configDir && configDir.trim().length > 0) {
    return path.join(expandHome(configDir.trim()), "projects");
  }
  return path.join(os.homedir(), ".claude", "projects");
}

function expandHome(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export async function listProjects(): Promise<ProjectEntry[]> {
  const root = resolveProjectsRoot();

  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(root, { withFileTypes: true });
  } catch (err) {
    throw new Error(`projects directory not found at ${root}`);
  }

  const entries = await Promise.all(
    dirents
      .filter((d) => d.isDirectory())
      .map((d) => buildProjectEntry(root, d.name))
  );

  return entries
    .filter((e): e is ProjectEntry => e !== null)
    .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
}

async function buildProjectEntry(
  root: string,
  dirName: string
): Promise<ProjectEntry | null> {
  const dirPath = path.join(root, dirName);

  let files: string[];
  try {
    files = (await fs.promises.readdir(dirPath)).filter((f) =>
      f.endsWith(".jsonl")
    );
  } catch {
    return null;
  }
  if (files.length === 0) {
    return null;
  }

  const stats = await Promise.all(
    files.map(async (f) => ({
      file: f,
      stat: await fs.promises.stat(path.join(dirPath, f)),
    }))
  );

  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const latest = stats[0];
  const lastActive = latest.stat.mtime;

  let cwd = decodeDirName(dirName);
  let snippet = "";
  try {
    const extracted = await extractCwdAndSnippet(
      path.join(dirPath, latest.file)
    );
    if (extracted.cwd) {
      cwd = extracted.cwd;
    }
    snippet = extracted.snippet;
  } catch {
    // fall back to decoded dir name / empty snippet
  }

  if (!(await pathExists(cwd))) {
    // Can't reliably reconstruct the project path; skip it rather than
    // offering a folder that doesn't open.
    return null;
  }

  return {
    cwd,
    dirName,
    sessionCount: stats.length,
    lastActive,
    snippet,
  };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.stat(p);
    return true;
  } catch {
    return false;
  }
}

function decodeDirName(dirName: string): string {
  // Claude Code encodes the project cwd by replacing path separators with
  // "-". This is lossy for paths that themselves contain dashes, so it's
  // only used as a last-resort fallback when a session file doesn't carry
  // an explicit "cwd" field.
  return dirName.replace(/-/g, path.sep);
}

interface ExtractedInfo {
  cwd: string | null;
  snippet: string;
}

async function extractCwdAndSnippet(filePath: string): Promise<ExtractedInfo> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let cwd: string | null = null;
  let snippet = "";
  let lineCount = 0;

  try {
    for await (const line of rl) {
      lineCount++;
      if (lineCount > MAX_LINES_TO_SCAN || (cwd && snippet)) {
        break;
      }
      if (!line.trim()) {
        continue;
      }

      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      if (!cwd && typeof obj.cwd === "string") {
        cwd = obj.cwd;
      }

      if (!snippet && obj.type === "user" && obj.message?.role === "user") {
        snippet = extractSnippet(obj.message.content);
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return { cwd, snippet };
}

function extractSnippet(content: unknown): string {
  let text = "";

  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    const candidates = content
      .filter((block) => block && block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string);
    text =
      candidates.find((t) => !t.trim().startsWith("<")) ?? candidates[0] ?? "";
  }

  text = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const MAX_LEN = 90;
  return text.length > MAX_LEN ? text.slice(0, MAX_LEN) + "…" : text;
}
