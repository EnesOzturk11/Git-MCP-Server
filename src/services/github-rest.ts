import { GithubIssue, GithubIssueRequest } from "../types/github.js";

// Generic fetch function for GitHub API requests
async function githubFetch<T>(
    endpoint: string,
    token: string | undefined,
    options?: RequestInit
): Promise<{ data: T | null; error: string | null }> {
    const url = `https://api.github.com${endpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28",
                ...(options?.headers || {})
            }
        });

        if (!response.ok) {
            return {
                data: null,
                error: `GitHub API error: ${response.status} ${response.statusText}`
            };
        }

        const data = await response.json();
        return { data, error: null };

    } catch (error: any) {
        return { data: null, error: `Request failed: ${error.message}` };
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



// Create a new issue in the given repository
async function createIssue(repoOwner: string, repoName: string, issueRequest: GithubIssueRequest, token: string | undefined): Promise<{ data: GithubIssue | null; error: string | null }> {
    return githubFetch<GithubIssue>(
        `/repos/${repoOwner}/${repoName}/issues`,
        token,
        { method: "POST", body: JSON.stringify(issueRequest) }
    );
}

export const githubRest = {
    attachLabeltoIssue,
    githubFetch,
    createIssue
}