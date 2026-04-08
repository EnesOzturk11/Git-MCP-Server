# Git MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives AI assistants the ability to inspect local Git repositories and interact with the GitHub API — reading commit history, diffs, file contents, issues, comments, pull requests, and project boards — all from a single, modular TypeScript server.

---

## Tools

The server exposes **10 tools** across four categories.

### Git

| Tool | Description |
|------|-------------|
| `get_git_status` | Returns all uncommitted changes in a local repository (equivalent to `git status`). |
| `get_git_log` | Retrieves recent commit history with hash, author, date, and message. Accepts a `maxCount` limit. |
| `get-git-diff` | Shows line-by-line file differences. Can be scoped to a specific file or limited to staged changes only. |
| `get_repo_structure` | Returns the full directory and file tree of a repository — useful for architectural overviews and documentation. |

### File System

| Tool | Description |
|------|-------------|
| `read_local_file` | Reads the entire content of a small file at once. Ideal for source files and configs. |
| `read_local_file_chunk` | Reads a specific line range (`startLine`–`endLine`) from a large file, avoiding unnecessary context. |

### GitHub Issues

| Tool | Description |
|------|-------------|
| `fetch_all_issues` | Fetches all issues (open and closed) from a remote GitHub repository. |
| `get_issue_comments` | Retrieves all comments on a specific issue by number, including author and timestamps. |
| `create_and_board_issue` | Creates a new issue with title, body, labels, assignees, and priority — then automatically adds it to the repository's GitHub Projects board. Handles multi-project repos by prompting for project selection. |

### GitHub Pull Requests

| Tool | Description |
|------|-------------|
| `fetch_merged_prs` | Lists recent pull requests from a repository. Toggle between merged and open PRs with `isMerged`. Useful for generating changelogs and release notes. |

---

## Architecture

The server follows a layered, modular design introduced in [PR #1](https://github.com/EnesOzturk11/Git-MCP-Server/pull/1):

```
src/
├── index.ts              # Server bootstrap — wires tools to the MCP server
├── config.ts             # Centralised environment config (GITHUB_TOKEN, cache TTL)
├── services/
│   ├── github-rest.ts    # GitHub REST API client
│   ├── github-graphql.ts # GitHub GraphQL client (used for Projects v2 boarding)
│   ├── cache.ts          # In-memory project metadata cache (1 h TTL)
│   └── git-cmd.ts        # Local Git CLI wrapper
├── tools/
│   ├── git.ts            # Git operation tools
│   ├── filesystem.ts     # File reading tools
│   ├── issues.ts         # GitHub Issue tools
│   └── pulls.ts          # GitHub Pull Request tools
├── types/
│   ├── github.ts         # GitHub API response types
│   ├── cache.ts          # Cache types
│   └── git.ts            # Git operation types
└── utils/
    └── helpers.ts        # Shared utility functions
```

---

## Requirements

- **Node.js** v18 or later
- **GitHub Personal Access Token** with `repo` and `project` scopes

---

## Installation

```bash
# Clone the repository
git clone https://github.com/EnesOzturk11/Git-MCP-Server.git
cd Git-MCP-Server

# Install dependencies
npm install

# Build
npm run build
```

---

## Configuration

The server reads a single environment variable:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | Personal Access Token for GitHub API authentication |

Create a `.env` file in the project root or export the variable in your shell:

```bash
GITHUB_TOKEN=ghp_your_token_here
```

---

## Usage with Claude Desktop

Add the server to your Claude Desktop configuration file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "git-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/Git-MCP-Server/build/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

Restart Claude Desktop — the 10 tools will become available immediately.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5 |
| Runtime | Node.js (ESM) |
| Protocol | Model Context Protocol SDK `^1.26.0` |
| Validation | Zod `^4.3.6` |
| GitHub API | REST + GraphQL (Projects v2) |
| Environment | dotenv |

---

## Contributing

Issues and pull requests are welcome. Please open an issue first to discuss any significant changes.
