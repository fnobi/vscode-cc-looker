# CC Looker

Incrementally search your local Claude Code sessions, grouped by project, and jump straight into one in VS Code.

## Usage

Run **CC Looker: Open Claude Code Project** from the Command Palette (`Cmd+Shift+P`).

A quick-pick list appears showing every project that has Claude Code sessions under
`~/.claude/projects` (or `$CLAUDE_CONFIG_DIR/projects`), sorted by most recently active.
Each entry shows the project path, session count, last-active time, and a snippet of the
most recent prompt. Type to fuzzy-filter, then press Enter to open that project folder.

## Settings

- `ccLooker.claudeProjectsPath` — override the Claude Code projects directory.
- `ccLooker.openInNewWindow` — open the selected project in a new window (default: `true`).

## Development

```sh
npm install
npm run watch
```

Then press `F5` in VS Code to launch an Extension Development Host.
