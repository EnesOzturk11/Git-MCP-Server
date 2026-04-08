// Github issue interface
export interface GithubSimpleUser {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    html_url: string;
    type: string;
    site_admin: boolean;
}

export interface GithubIssue {
    id: number;
    node_id: string;
    number: number;
    title: string;
    body: string | null;
    state: string;
    html_url: string;
    url: string;
    user: GithubSimpleUser;
    assignee: GithubSimpleUser | null;
    assignees: GithubSimpleUser[];
}

export interface GithubIssueRequest {
    title: string;
    body?: string;
    assignee?: string;
    labels?: string[];
    assignees?: string[];
    type?: string;
}

export interface GithubIssueComment {
    id: number,
    node_id: string,
    body: string,
    user: GithubSimpleUser | null,
    created_at: string,
    updated_at: string
}

type GithubPullRequestState = "open" | "closed";

interface GithubPullRequestLinks {
    self: { href: string };
    html: { href: string };
    issue: { href: string };
    comments: { href: string };
    review_comments: { href: string };
    review_comment: { href: string };
    commits: { href: string };
    statuses: { href: string };
}

interface GithubPullRequestBranch {
    label: string;
    ref: string;
    sha: string;
}

export interface GithubPullRequest {
    id: number;
    node_id: string;
    number: number;

    url: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
    issue_url: string;
    commits_url: string;
    review_comments_url: string;
    review_comment_url: string;
    comments_url: string;
    statuses_url: string;

    state: GithubPullRequestState;
    locked: boolean;
    title: string;
    body: string | null;

    user: GithubSimpleUser;
    assignee: GithubSimpleUser | null;
    assignees: GithubSimpleUser[];
    requested_reviewers: GithubSimpleUser[];

    created_at: string;
    updated_at: string;
    closed_at: string | null;
    merged_at: string | null;
    merge_commit_sha: string | null;

    draft: boolean;
    author_association: string;
    active_lock_reason: string | null;

    head: GithubPullRequestBranch;
    base: GithubPullRequestBranch;

    _links: GithubPullRequestLinks;
    auto_merge: unknown | null;

}