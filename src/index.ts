import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from 'child_process';
import { title } from "process";
import {z} from "zod";
import { da, is, ur } from "zod/locales";



// Create Server instance
const server = new McpServer({
    "name": "git-mcp-server",
    "version": "1.0.0"
});

// Helper functions
function runGitCommand (command : string, path: string = "."): string {
    try {
        return execSync(`git -C "${path}" ${command}`, {encoding: "utf-8"}).trim();
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

// Github issue interface
interface GithubIssue {
    id: number,
    number: number,
    title: string,
    body: string,
    state: string,
    html_url: string,
    labels_url: string,
    comments_url: string,
    events_url: string,
    user: any,
    assignee: any,
    assignees: any,
    pull_request?: any
}

// Format the commit
function formatCommit(commit: CommitInfo): string {
    return `{ID: ${commit.hash}\nAuthor: ${commit.author}\nDate: ${commit.date}\nMessage: ${commit.message}}\n`;
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
);

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
);

// Tool that demonstrade all changes in files line by line
server.registerTool(
    "get-git-diff",
    {
        title: "Get Git Diff",
        description: "Get all difference in files and show the differences line by line. It can focus on a specific file according to willingness",
        inputSchema: z.object({
            repoPath: z.string().describe("GitHub repository path"),
            targetFile: z.string().optional().describe("Show difference only this file"),
            cached: z.boolean().optional().default(false).describe("Show difference that are taken to stage")
        })
    },
    async ({repoPath, targetFile, cached}) => {
        let command = "diff";

        if (cached) {
            command += " --cached";
        }

        if (targetFile) {
            command += ` ${targetFile}`;
        }

        const diff = runGitCommand(command, repoPath);

        return {
            content: [{
                type: "text" as const,
                text: diff || "There is no change in the related file/s"
            }]
        }
    }
);

// Tool that get all issues a given repo from the github
server.registerTool(
    "fetch_all_issues",
    {
        title: "Get All Issues",
        description: "Get all issues from the specified remote repo and list them",
        inputSchema: z.object({
            repoName: z.string().describe("Exact repo name for the url parameter. Ask the user if it is not provided."),
            repoOwner: z.string().describe("Exact repository owner for the url paramter that indicates what is the owber of the repo. Ask the user if it is not provided.")
        })
    },
    async ({repoName, repoOwner}) => {
        const token = process.env.GITHUB_TOKEN;
        const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues?state=all`;

        try {
            const response = await fetch(url, {
                headers: {
                    "Accept": "application/vnd.github+json",
                    "Authorization": `Bearer ${token}`,
                    "X-GitHub-Api-Version": "2022-11-28"
                }
            });

            if (!response.ok) {
                return {
                    content: [{
                        type: "text",
                        text: `Github API error is occured: ${response.status} ${response.statusText}`
                    }]
                }
            }

            const data: any[] = await response.json();
            const issue_list : GithubIssue[] = data.filter(issue => !issue.pull_request)
            .map(issue => ({
                id: issue.id,
                number: issue.number,
                title: issue.title,
                body: issue.body,
                state: issue.state,
                html_url: issue.html_url,
                labels_url: issue.labels_url,
                comments_url: issue.comments_url,
                events_url: issue.events_url,
                user: issue.user,
                assignee: issue.assignee,
                assignees: issue.assignees,
                pull_request: issue.pull_request
            }));

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(issue_list, null, 2)
                }]
            };
        }

        catch (error : any) {
            console.error("Fetch Error");
            return {
                content: [{
                    type: "text",
                    text: `Unexpected Error ${error}`
                }],
                isError: true
            };
        }
        
    }
);

// Tool that get all comments about a given issue based on its comment url
server.registerTool(
    "get_issue_comments",
    {
        title: "Get All Comments of the Given Issue",
        description: "Retrieves the all comments of the given issue based on its comment_url datafield which is given in the parameter of the function",
        inputSchema: z.object({
            repoName: z.string().describe("Exact repo name for the url parameter. Ask the user if it is not provided."),
            repoOwner: z.string().describe("Exact repository owner for the url paramter that indicates what is the owber of the repo. Ask the user if it is not provided."),
            issue_number: z.number().describe("The specific number of the issue to fetch comments for.")
        })
    },

    async ({repoName, repoOwner, issue_number}) => {
        const token = process.env.GITHUB_TOKEN;
        const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issue_number}/comments`;

        try {
            const response = await fetch(url, {
                headers: {
                    "Accept": "application/vnd.github+json",
                    "Authorization": `Bearer ${token}`,
                    "X-GitHub-Api-Version": "2022-11-28"
                }
            });

            if (!response.ok) {
                return {
                    content: [{
                        type: "text",
                        text: `Github API error is occured: ${response.status} ${response.statusText}`
                    }]
                }
            }

            const data: any[] = await response.json();

            if (data.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "There is no comment for the issue"
                    }]
                };
            }

            const comments_list = data.map(comment => ({
                id: comment.id,
                node_id: comment.node_id,
                body: comment.body,
                user: comment.user,
                created_at: comment.created_at,
                updated_at: comment.updated_at
            }));

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(comments_list, null, 2)
                }]
            };
        }

        catch (error) {
            console.error("Fetch Error");
            return {
                content: [{
                    type: "text",
                    text: `Unexpected Error ${error}`
                }],
                isError: true
            };
        }
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);