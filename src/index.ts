import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from 'child_process';
import {z} from "zod";

// Create Server instance
const server = new McpServer({
    "name": "git-mcp-server",
    "version": "1.0.0"
});

// Helper functions
function runGitCommand (command : string, path: string = "."): string {
    try {
        return execSync(`git -C ${path} ${command}`, {encoding: "utf-8"}).trim();
    } catch(error) {
        console.error(`Git Error: ${error}`);
        return `Error: Command not runned ${command}`;
    }
}

// Commit Format Template
interface CommitInfo {
    hash: string,
    author: string,
    date: string,
    message: string
}

// Branch format template
interface BranchInfot {
    name: string,
    isCurrent: boolean
}

// Format the commit
function formatCommit(commit: CommitInfo): string {
    return `{ID: ${commit.hash}\nAuthor: ${commit.author}\nDate: ${commit.date}\nMessage: ${commit.message}},`;
}

// Tool that summarizes the all changes in the cirectory
server.registerTool(
    "get_git_status",
    {
        title: "Get Git Status",
        description: "Get all changes in directory by calling git command (git status)",
        inputSchema: z.object({
            repoPath: z.string().describe("GitHub repository path")
        }),
    },
    async ({repoPath}) => {
        const status = runGitCommand("status --short", repoPath);
        return {
            content: [{
                type: "text" as const,
                text: status.trim() ? status : "Everything is updated"
            }]
        }
    }
)

// Tool that reads recent commits about the project
server.registerTool(
    "get_git_log",
    {
        title: "Get Git Log",
        description: "List recent commits of the project",
        inputSchema: z.object({
            repoPath: z.string().describe("GitHub repository path"),
            maxCount: z.number().min(1)
        })
    },
    async ({repoPath, maxCount}) => {
        const raw = runGitCommand(`log -n ${maxCount} --pretty=format:"%H||%an||%ad||%s"`, repoPath);
        const commits: CommitInfo[] = raw
            .split("\n")
            .filter(Boolean)
            .map((line) => {
                const [hash, author, date, message] = line.split("||")
                return {
                    hash,
                    author,
                    date,
                    message
                }
            });
        const responses: string[] = commits
            .map((commit) => formatCommit(commit));
        const result = responses.join(",")
        return {
            content: [{
                type: "text" as const,
                text: result.trim() ? result : "Commit not found"
            }]
        }
    }
)