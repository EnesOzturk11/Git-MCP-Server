import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { git } from "../services/git-cmd.js";
import { CommitInfo } from "../types/git.js";
import {z} from "zod";

// Tool that summarizes the all changes in the cirectory
function registerGitStatusTool(server: McpServer) {
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
            const status = git.runGitCommand("status --short", repoPath);
            return {
                content: [{
                    type: "text" as const,
                    text: status.trim() ? status : "Everything is updated"
                }]
            }
        }
    );
}


// Tool that reads recent commits about the project
function registerGitLogTool(server: McpServer) {
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
            const raw = git.runGitCommand(`log -n ${maxCount} --pretty=format:"%H||%an||%ad||%s"`, repoPath);
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
                .map((commit) => git.formatCommit(commit));
            const result = responses.join(",")
            return {
                content: [{
                    type: "text" as const,
                    text: result.trim() ? result : "Commit not found"
                }]
            }
        }
    );
}


// Tool that demonstrade all changes in files line by line
function registerGitDiffTool(server: McpServer) {
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
    
            const diff = git.runGitCommand(command, repoPath);
    
            return {
                content: [{
                    type: "text" as const,
                    text: diff || "There is no change in the related file/s"
                }]
            }
        }
    );
}


// Tool that list the all structure of the files and directories in the project
function registerRepoStructureTool(server: McpServer) {
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
            const tree = git.runGitCommand("ls-tree -r HEAD --name-only", repoPath);
    
            return {
                content: [{
                    type: "text" as const,
                    text: tree.trim() ? tree : "Repository is empty or no files are tracked."
                }]
            }
        }
    ); 
}


export const gitTools = {
    registerGitStatusTool,
    registerGitLogTool,
    registerGitDiffTool,
    registerRepoStructureTool
}