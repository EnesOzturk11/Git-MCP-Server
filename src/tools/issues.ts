import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GithubIssue, GithubIssueComment, GithubIssueRequest } from "../types/github.js";
import { githubRest } from "../services/github-rest.js";
import { githubGraphql } from "../services/github-graphql.js";
import { cache } from "../services/cache.js";
import { config } from "../config.js";


// Tool that get all issues a given repo from the github
function registerFetchIssueTool(server: McpServer) {
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
            const token = config.TOKEN;
            const endPoint = `/repos/${repoOwner}/${repoName}/issues?state=all`;

            const { data, error } = await githubRest.githubFetch<GithubIssue[]>(endPoint, token);

            if (error || !data) {
                return { content: [{ type: "text", text: error || "No data received" }], isError: true };
            }

    
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
    );
}


function registerFetchIssueComments(server: McpServer) {
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
            const token = config.TOKEN
            const endPoint = `/repos/${repoOwner}/${repoName}/issues/${issue_number}/comments`;

            const { data, error} = await githubRest.githubFetch<GithubIssueComment[]>(endPoint, token)

            if (error || !data) {
                return { content: [{ type: "text", text: error || "No data received" }], isError: true };
            }
    
    
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
    );
}


function registerCreatenAndBoardIssue(server: McpServer) {
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
            const token = config.TOKEN;

            // 1. Resolve project from cache (or fetch if stale/missing)
            const repoProject = await cache.getCachedProjectData(repoOwner, repoName);
            let currentProject = null;

            if (repoProject.projects.length === 0) {
                return {
                    content: [{ type: "text" as const, text: `No projects found in ${repoOwner}/${repoName}.` }],
                    isError: true
                };
            } else if (repoProject.projects.length === 1) {
                currentProject = repoProject.projects[0];
            } else {
                if (!targetProjectName) {
                    const projectNames = repoProject.projects.map(p => p.title).join("\n");
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Multiple projects found for ${repoOwner}/${repoName}. Ask the user which project to use:\n${projectNames}`
                        }]
                    };
                }
                currentProject = repoProject.projects.find(p => p.title === targetProjectName) ?? null;
                if (!currentProject) {
                    return {
                        content: [{ type: "text" as const, text: `Project "${targetProjectName}" not found. Available projects:\n${repoProject.projects.map(p => p.title).join("\n")}` }],
                        isError: true
                    };
                }
            }

            // 2. Create the issue via REST
            const issueRequest: GithubIssueRequest = { title, body, assignee, assignees, labels, type };
            const { data: issue, error: issueError } = await githubRest.createIssue(repoOwner, repoName, issueRequest, token);

            if (issueError || !issue) {
                return {
                    content: [{ type: "text" as const, text: issueError || "Failed to create issue." }],
                    isError: true
                };
            }

            const issueNodeId = issue.node_id;

            // 3. Attach labels (if any)
            if (labels && labels.length > 0) {
                await githubRest.attachLabeltoIssue(repoOwner, repoName, issue.number, labels, token);
            }

            // 4. Board the issue onto the project
            const attachResult = await githubGraphql.attachIssue(issueNodeId, currentProject.projectId, token);
            const itemId: string | undefined = attachResult?.data?.addProjectV2ItemById?.item?.id;
            if (!itemId) {
                return {
                    content: [{ type: "text" as const, text: "Issue created but could not be added to the project board." }],
                    isError: true
                };
            }

            // 5. Set priority field on the project item
            const fieldId: string | undefined = currentProject.fieldIds["Priority"];
            if (!fieldId) {
                return {
                    content: [{ type: "text" as const, text: "Issue created and boarded, but no 'Priority' field found in the project." }]
                };
            }

            const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);
            const optionId: string | undefined = currentProject.selectOptions["Priority"]?.[priorityLabel];
            if (!optionId) {
                return {
                    content: [{ type: "text" as const, text: `Issue created and boarded, but priority option "${priorityLabel}" not found in the project.` }]
                };
            }

            const priorityResult = await githubGraphql.attachPriorityToIssue(
                currentProject.projectId, itemId, fieldId, optionId, token
            );
            if (priorityResult.errors) {
                return {
                    content: [{ type: "text" as const, text: `Issue created and boarded, but setting priority failed: ${JSON.stringify(priorityResult.errors)}` }]
                };
            }

            return {
                content: [{
                    type: "text" as const,
                    text: `Issue #${issue.number} "${issue.title}" created and boarded on project "${currentProject.title}" with ${priorityLabel} priority.\nURL: ${issue.html_url}`
                }]
            };
        }
    );
}


export const gitHubIssueTools = {
    registerFetchIssueTool,
    registerFetchIssueComments,
    registerCreatenAndBoardIssue
}