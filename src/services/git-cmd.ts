import { execSync } from 'child_process';
import { CommitInfo } from '../types/git.js';

// Execute the git command in the terminal
function runGitCommand (command : string, path: string = "."): string {
    try {
        return execSync(`git -C "${path}" ${command}`, {encoding: "utf-8"}).trim();
    } catch(error) {
        console.error(`Git Error: ${error}`);
        throw new Error(`Error: Command failed ${command}`);
    }
}

// Format the commit
function formatCommit(commit: CommitInfo): string {
    return `{ID: ${commit.hash}\nAuthor: ${commit.author}\nDate: ${commit.date}\nMessage: ${commit.message}}\n`;
}


export const git = {
    formatCommit,
    runGitCommand
}