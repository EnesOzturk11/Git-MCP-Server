import { config } from "../config.js"
import { githubGraphql } from "../services/github-graphql.js";
import { RepoProjectCache } from "../types/cache.js";

// Hold the informations about the projects, repo etc.
const serverCache = new Map<string, RepoProjectCache>();

function isCacheStale(cacheData: RepoProjectCache): boolean {
    const now = Date.now();
    return (now - cacheData.lastUpdated) > config.CACHE_STALE_INTERVAL;
}

// Get the Id info for the project which name and owner are given
async function getCachedProjectData(repoOwner: string, repoName: string): Promise<RepoProjectCache> {
    const key = `${repoOwner}/${repoName}`;
    const cachedData = serverCache.get(key);

    if (!cachedData || isCacheStale(cachedData)) {
        const metadata = await githubGraphql.fetchProjectMetadata(repoOwner, repoName);
        serverCache.set(key, metadata);

        return metadata;
    }
    return cachedData;
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

export const cache = {
    getCachedProjectData,
    buildRepoProjectCache
}