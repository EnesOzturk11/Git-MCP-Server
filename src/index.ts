import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { gitHubIssueTools } from "./tools/issues.js";
import { gitHubPullTools } from "./tools/pulls.js";
import { gitTools } from "./tools/git.js";
import { fileSystemTools } from "./tools/filesystem.js";


// Create Server instance
const server = new McpServer({
    "name": "git-mcp-server",
    "version": "1.0.0"
});

// Git tools all registrations
gitTools.registerGitDiffTool(server);
gitTools.registerGitLogTool(server);
gitTools.registerGitStatusTool(server);
gitTools.registerRepoStructureTool(server);


// File system all registrations
fileSystemTools.registerReadLargeFile(server);
fileSystemTools.registerReadSmallFile(server);


// Github Issue tools registrations
gitHubIssueTools.registerCreatenAndBoardIssue(server);
gitHubIssueTools.registerFetchIssueComments(server);
gitHubIssueTools.registerFetchIssueTool(server);


// Github pull tools registrations
gitHubPullTools.registerFetchPR(server);




const transport = new StdioServerTransport();
await server.connect(transport);