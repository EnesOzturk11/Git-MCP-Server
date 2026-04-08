export interface ProjectInfo {
  title: string;
  projectId: string;
  projectNumber: number;
  closed: boolean;
  fieldIds: Record<string, string>;
  selectOptions: Record<string, Record<string, string>>;
  lastUpdated: number;
}

export interface RepoProjectCache {
  repoOwner: string;
  repoName: string;
  repositoryId: string;
  projects: ProjectInfo[];
  lastUpdated: number;
}
