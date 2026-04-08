import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { githubRest } from "../services/github-rest.js";
import { GithubPullRequest } from "../types/github.js";

function registerFetchPR(server: McpServer) {
    // Tool that fetch closed and merged all pull requests
    server.registerTool(
        "fetch_merged_prs",
        {
            title: "Fetch Pull Requests",
            description: "Retrieves a list of Pull Requests from the specified GitHub repository. Crucial for generating automated release notes, writing changelogs, or summarizing the latest features and bug fixes added to the project.",
            inputSchema: z.object({
                repoOwner: z.string().describe("The owner of the repository (e.g., 'facebook'). Ask the user if not provided."),
                repoName: z.string().describe("The name of the repository (e.g., 'react'). Ask the user if not provided."),
                limit: z.number().optional().default(10).describe("The maximum number of recent merged PRs to fetch. Defaults to 10."),
                isMerged: z.boolean().optional().default(false).describe("The boolean variable that indicates which type of pull requests will be fetched merged or not merged. Defaults is false which means fetch not merged pull requests.")
            })
        },
        async ({repoOwner, repoName, limit, isMerged}) => {
            const token = config.TOKEN;
            const endPoint = `/repos/${repoOwner}/${repoName}/pulls?state=closed&per_page=30&sort=updated&direction=desc`;
    
            const { data, error} = await githubRest.githubFetch<GithubPullRequest[]>(endPoint, token);

            if (error || !data) {
                return { content: [{ type: "text", text: error || "No data received" }], isError: true };
            }

            const fetchedPRs = data
            .filter(pr => isMerged ? pr.merged_at !== null : pr.merged_at === null)
            .slice(0, limit);
    

            if (fetchedPRs.length === 0) {
                const text = isMerged ? "No merged Pull Requests found in the recent history." : "There is no Pull Request in the recent history."
                return {
                    content: [{ type: "text", text: text }]
                };
            }
            
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(fetchedPRs, null, 2)
                }]
            };
    
        }
    );
}


export const gitHubPullTools = {
    registerFetchPR,
}