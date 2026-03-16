import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from 'child_process';
import fs from 'node:fs';
import path from "node:path";
import {z} from "zod";



const CACHE_STALE_INTERVAL = 1 * 60 * 60 * 1000; // 24 hours

// Commit Format Template
interface CommitInfo {
    hash: string,
    author: string,
    date: string,
    message: string
}

// Github issue interface
interface GithubIssue {
    id: number,
    number: number,
    title: string,
    body: string,
    state: string,
    html_url: string,
    user: string,
    assignee: string,
    assignees: string[]
}

interface GithubIssueRequest {
    title: string,
    body: string,
    assignee?: string,
    labels?: string[],
    assignees?: string[],
    type?: string
}


interface ProjectInfo {
  title: string;
  projectId: string;
  projectNumber: number;
  closed: boolean;
  fieldIds: Record<string, string>;
  selectOptions: Record<string, Record<string, string>>;
  lastUpdated: number;
}

interface RepoProjectCache {
  repoOwner: string;
  repoName: string;
  repositoryId: string;
  projects: ProjectInfo[];
  lastUpdated: number;
}

// Create Server instance
const server = new McpServer({
    "name": "git-mcp-server",
    "version": "1.0.0"
});

// Hold the informations about the projects, repo etc.
const serverCache = new Map<string, RepoProjectCache>();

// ----------------- Helper functions -------------------------
function runGitCommand (command : string, path: string = "."): string {
    try {
        return execSync(`git -C "${path}" ${command}`, {encoding: "utf-8"}).trim();
    } catch(error) {
        console.error(`Git Error: ${error}`);
        throw new Error(`Error: Command failed ${command}`);
    }
}

function isCacheStale(cacheData: RepoProjectCache): boolean {
    const now = Date.now();
    return (now - cacheData.lastUpdated) > CACHE_STALE_INTERVAL;
}

// Find field by case-insensitive name match
function findFieldByName(fieldIds: Record<string, string>, fieldName: string): string | undefined {
    const lowerName = fieldName.toLowerCase();
    for (const [name, id] of Object.entries(fieldIds)) {
        if (name.toLowerCase() === lowerName) {
            return id;
        }
    }
    return undefined;
}

// Find select option by case-insensitive name match
function findSelectOptionByName(selectOptions: Record<string, Record<string, string>>, fieldName: string, optionName: string): string | undefined {
    const lowerFieldName = fieldName.toLowerCase();
    for (const [name, options] of Object.entries(selectOptions)) {
        if (name.toLowerCase() === lowerFieldName) {
            return options[optionName];
        }
    }
    return undefined;
}

function buildRepoProjectCache(data: any): RepoProjectCache {
  const repo = data.data.repository;

  return {
    repoOwner: repo.owner.login,
    repoName: repo.name,
    repositoryId: repo.id,
    lastUpdated: Date.now(),
    projects: repo.projectsV2.nodes.map((project: any) => {
      const fieldIds: Record<string, string> = {};
      const selectOptions: Record<string, Record<string, string>> = {};

      for (const field of project.fields.nodes) {
        fieldIds[field.name] = field.id;

        if ("options" in field && Array.isArray(field.options)) {
          selectOptions[field.name] = Object.fromEntries(
            field.options.map((option: any) => [option.name, option.id])
          );
        }
      }

      return {
        title: project.title,
        projectId: project.id,
        projectNumber: project.number,
        closed: project.closed,
        fieldIds,
        selectOptions,
        lastUpdated: Date.now(),
      };
    }),
  };
}

// Get the Id info for the project which name and owner are given
async function getCachedProjectData(repoOwner: string, repoName: string): Promise<RepoProjectCache> {
    const key = `${repoOwner}/${repoName}`;
    const cachedData = serverCache.get(key);

    if (!cachedData || isCacheStale(cachedData)) {
        const metadata = await fetchProjectMetadata(repoOwner, repoName);
        serverCache.set(key, metadata);

        return metadata;
    }
    return cachedData;
}

// Fetches the project from the specific repository
async function fetchProjectMetadata(repoOwner: string, repoName: string): Promise<RepoProjectCache> {
    const url = "https://api.github.com/graphql";
    const token = process.env.GITHUB_TOKEN;
    const query = `
        query GetRepoProjects($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
              # Basic Repository Info
              id
              name
              owner {
                login
              }

              # Projects V2 (New Projects)
              projectsV2(first: 20) {
                nodes {
                  id
                  title
                  number
                  closed

                  # Fields/Columns within the Project
                  fields(first: 50) {
                    nodes {
                      # Standard fields (Date, Text, Number, etc.)
                      ... on ProjectV2Field {
                        id
                        name
                      }

                      # Iteration fields (Sprints/Cycles)
                      ... on ProjectV2IterationField {
                        id
                        name
                      }

                      # Single Select fields (Status, Priority, etc.)
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                        options {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
        }
    `;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query: query,
                variables: {owner: repoOwner, name: repoName}
            })
        });

        if (!response.ok) {
            throw new Error(`GraphQL API error: ${response.status}`);
        }

        const result = await response.json();

        if (result.errors) {
            console.error("GraphQL Errors:", result.errors);
            throw new Error("Error fetching from GraphQL");
        }

        if (result.data) {
            return buildRepoProjectCache(result);
        }
        else {
            throw new Error("GraphQL returned null value");
        }
        

    } catch(error: any) {
        console.error("fetchProjectMetadata: ",error);
        throw new Error(`Post request cannot be sent also error: ${error.message}`);
    }
}

// Attach the given labels to the specific issue which number is given
async function attachLabeltoIssue(repoOwner: string, repoName: string, issueNumber: number, labels: string[], token: string | undefined): Promise<any[]> {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/labels`;

    try {
        const response = await fetch(url, {
        method: "POST",
        headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
            labels: labels
            })
        });

        return await response.json();

    }
    catch (error: any) {
        throw new Error(`REST API for attaching labels to the issue is failed with error: ${error.message}`);
    }
}

// Attach the priority to the given issue
async function attachPriorityToIssue(projectId: string, itemId: string, fieldId: string, optionId: string, token: string | undefined): Promise<any> {
    const updatePriorityMutation = `
        mutation SetPriority($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
            updateProjectV2ItemFieldValue(input: {
                projectId: $projectId
                itemId: $itemId
                fieldId: $fieldId
                value: { singleSelectOptionId: $optionId }
            }) {
                projectV2Item {
                    id
                }
            }
        }
    `;
    const priorityResponse = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            query: updatePriorityMutation,
            variables: {
                projectId: projectId,
                itemId: itemId,
                fieldId: fieldId,
                optionId: optionId
            }
        })
    });

    return priorityResponse.json();
}

// Attach the issue which node_id is given to the specific project
async function attachIssue(node_id: string, projectId: string, token: string | undefined) {
    const addToProjectMutation = `
        mutation AddIssueToProject($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: {
            projectId: $projectId
            contentId: $contentId
          }) {
            item {
              id
            }
          }
        }`;

    try {
        const projectResponse = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query: addToProjectMutation,
                variables: {
                    projectId: projectId,
                    contentId: node_id
                }
            })
        });

        if (!projectResponse.ok) {
            throw new Error(`HTTP Error: ${projectResponse.status}`);
        }

        const result = await projectResponse.json();
        if (result.errors) {
            throw new Error(`GraphQL Error: ${result.errors[0].message}`);
        }

        return result;
    }
    catch(error: any) {
        throw new Error(`Mutation query for attaching the priority cannot be sent with error: ${error.message}`);
    }
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
                user: issue.user,
                assignee: issue.assignee,
                assignees: issue.assignees
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

// Tool that list the all structure of the files and directories in the project
server.registerTool(
    "get_repo_structure",
    {
        title: "Get Repository Structure",
        description: "Returns the directory and file structure of the git repository. Useful for architectural documentation.",
        inputSchema: z.object({
            repoPath: z.string().describe("Github repository base path")
        })
    },
    async ({repoPath}) => {
        const tree = runGitCommand("ls-tree -r HEAD --name-only", repoPath);

        return {
            content: [{
                type: "text" as const,
                text: tree.trim() ? tree : "Repository is empty or no files are tracked."
            }]
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
            repoOwner: z.string().describe("Exact repository owner for the url parameter that indicates what is the owner of the repo. Ask the user if it is not provided."),
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

// Tool that fetch closed and merged all pull requests
server.registerTool(
    "fetch_merged_prs",
    {
        title: "Fetch Merged Pull Requests",
        description: "Retrieves a list of recently closed and successfully merged Pull Requests from the specified GitHub repository. Crucial for generating automated release notes, writing changelogs, or summarizing the latest features and bug fixes added to the project.",
        inputSchema: z.object({
            repoOwner: z.string().describe("The owner of the repository (e.g., 'facebook'). Ask the user if not provided."),
            repoName: z.string().describe("The name of the repository (e.g., 'react'). Ask the user if not provided."),
            limit: z.number().optional().default(10).describe("The maximum number of recent merged PRs to fetch. Defaults to 10.")
        })
    },
    async ({repoOwner, repoName, limit}) => {
        const token = process.env.GITHUB_TOKEN;
        const url = `https://api.github.com/repos/${repoOwner}/${repoName}/pulls?state=closed&per_page=30&sort=updated&direction=desc`;

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
                    content: [{ type: "text", text: `GitHub API error: ${response.status} ${response.statusText}` }]
                };
            }

            const data: any[] = await response.json();

            const mergedPRs = data
                .filter(pr => pr.merged_at !== null)
                .slice(0, limit)
                .map(pr => ({
                    number: pr.number,
                    title: pr.title,
                    body: pr.body || "No description provided.",
                    merged_at: pr.merged_at,
                    author: pr.user.login,
                    url: pr.html_url
                }));
            
            if (mergedPRs.length === 0) {
                return {
                    content: [{ type: "text", text: "No merged Pull Requests found in the recent history." }]
                };
            }
        
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(mergedPRs, null, 2)
                }]
            };

        }
        catch (error: any) {
            console.error("Fetch Error:", error);
            return {
                content: [{ type: "text", text: `Unexpected Error: ${error.message}` }],
                isError: true
            };
        }
    }
);

// Tool that create the github issue if there is an bug or whatelse has to be fixed
server.registerTool(
    "create_and_board_issue",
    {
        title: "Create GitHub Issue and Board the Issue",
        description: "Creates a new issue in a GitHub repository and automatically assigns it to the project board with a specific priority. Use this when identifying bugs, technical debt, or documentation gaps that need tracking.",
        inputSchema: z.object({
            repoOwner: z.string().describe("The GitHub username or organization name that owns the repository (e.g., 'octocat')."),
            repoName: z.string().describe("The exact name of the repository where the issue will be created (e.g., 'hello-world')."),
            title: z.string().describe("A descriptive, high-level title for the issue. Be concise but specific."),
            body: z.string().describe("A detailed Markdown-formatted description. Include reproduction steps, code snippets, and why this fix/feature is necessary."),
            assignee: z.string().optional().describe("The GitHub handle of the primary person responsible for this issue. Use this for single assignments."),
            assignees: z.array(z.string()).optional().describe("A list of GitHub handles to assign to this issue. Use this if multiple people need to be tagged."),
            labels: z.array(z.string()).optional().describe("An array of labels to categorize the issue (e.g., ['bug', 'help wanted']). Labels must exist in the repo or will be created."),
            priority: z.enum(["high", "medium", "low"]).describe("The urgency level. This will determine the issue's placement and metadata on the project board."),
            type: z.string().optional().describe("The category of the issue, such as 'bug', 'feature', 'refactor', or 'documentation'."),
            targetProjectName: z.string().optional().describe("If the repo has multiple projects, the name of the selected project. LEAVE EMPTY on the first call."),
        })
    },
    async ({repoOwner, repoName, title, body, assignee, assignees, labels, priority, type, targetProjectName}) => {
        const repoProject = await getCachedProjectData(repoOwner, repoName);
        let currentProject = null;

        if (repoProject.projects.length == 0) {
            throw new Error(`There is no project in the ${repoName} repository belongs to ${repoOwner}`);
        }
        else if (repoProject.projects.length == 1) {
            currentProject = repoProject.projects[0];
        }
        else {
            if (!targetProjectName) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `Ask the user for valid project name because there are more than one projects related with the given repo. All projects name are:\n${repoProject.projects.map(project => project.title).join("\n")}`
                    }]
                }
            }
            for (let project of repoProject.projects) {
                if (project.title === targetProjectName) {
                    currentProject = project;
                    break;
                }
            }
        }

        if (!currentProject) {
            throw new Error(`Not find the project name with: ${targetProjectName}`);
        }

        const token = process.env.GITHUB_TOKEN;
        const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues`;
        const issueRequest: GithubIssueRequest = {
            title: title,
            body: body,
            assignee: assignee,
            assignees: assignees,
            labels: labels,
            type: type
        };

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                body: JSON.stringify(issueRequest)
            });
            
            if (!response.ok) {
                return {
                    content: [{ type: "text", text: `GitHub API error: ${response.status} ${response.statusText}` }],
                    isError: true
                };
            }

            const issue = await response.json();
            const issueNodeId = issue.node_id;
            if (!issueNodeId) {
                return {
                    content: [{ type: "text", text: `Issue id not found: ${response.status} ${response.statusText}` }],
                    isError: true
                }
            }
            // Add labels to the issue
            const labelResponse = await attachLabeltoIssue(repoOwner, repoName, issue.number, labels ?? [], token);

            const projectId = currentProject.projectId;
            if (!projectId) {
                return {
                    content: [{
                        type: "text" as const,
                        text: "There is no projectId field in this project"
                    }],
                    isError: true
                }
            }

            // Attach the issue into the project
            const attachResult = await attachIssue(issueNodeId, projectId, token);

            const itemId = attachResult?.data?.addProjectV2ItemById?.item?.id; // ItemId required for attaching priority to the issue
            const fieldId = findFieldByName(currentProject.fieldIds, "Priority");
            if (!fieldId) {
                return {
                    content: [{
                        type: "text" as const,
                        text: "There is no priority field in this project"
                    }],
                    isError: true
                }
            }

            const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);
            const optionId = findSelectOptionByName(currentProject.selectOptions, "Priority", priorityLabel);
            if (!optionId) {
                return {
                    content: [{
                        type: "text" as const,
                        text: "There is no optionId field in this project"
                    }],
                    isError: true
                }
            }

            const priorityResult = await attachPriorityToIssue(projectId, itemId, fieldId, optionId, token);
            if (priorityResult.errors) {
                return {
                    content: [{ type: "text", text: `Issue created and added to project but priority set failed: ${JSON.stringify(priorityResult.errors)}` }]
                };
            }

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(attachResult)
                }]
            }

        }
        catch (error: any) {
            return {
                content: [{ type: "text" as const, text: `Error posting the issue: ${error.message}` }],
                isError: true
            };
        }
    }
);

// Tool can read the local code file
server.registerTool(
    "read_local_file",
    {
        title: "Read the Local File",
        description: "Reads the entire content of a specific file. Crucial for understanding the full context of the code before writing documentation.",
        inputSchema: z.object({
            repoPath: z.string().describe("Github repository base path"),
            filePath: z.string().describe("Relative file path to the file (e.g., src/index.ts)") 
        })
    },
    async ({repoPath, filePath}) => {
        try {
            const full_path = path.join(repoPath, filePath);
            const content = fs.readFileSync(full_path, "utf-8");
            return {
                content: [{ type: "text" as const, text: content }]
            };
        }
        catch (error: any) {
            return {
                content: [{ type: "text" as const, text: `Error reading file: ${error.message}` }],
                isError: true
            };
        }
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);