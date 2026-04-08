import {RepoProjectCache} from "../types/cache.js";
import { cache } from "./cache.js";
import { config } from "../config.js";

// Fetches the project from the specific repository
async function fetchProjectMetadata(repoOwner: string, repoName: string): Promise<RepoProjectCache> {
    const url = "https://api.github.com/graphql";
    const token = config.TOKEN;
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
            return cache.buildRepoProjectCache(result);
        }
        else {
            throw new Error("GraphQL returned null value");
        }
        

    } catch(error: any) {
        console.error("fetchProjectMetadata: ",error);
        throw new Error(`Post request cannot be sent also error: ${error.message}`);
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



export const githubGraphql = {
    fetchProjectMetadata,
    attachPriorityToIssue,
    attachIssue,
}