import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from 'node:fs';
import path from "node:path";

function registerReadSmallFile(server: McpServer) {
    // Tool can read the small local code file
    server.registerTool(
        "read_local_file",
        {
            title: "Read the Small Local File",
            description: "Reads the entire content of a specific small sized file. Crucial for understanding the full context of the code before writing documentation.",
            inputSchema: z.object({
                repoPath: z.string().describe("Github repository base path"),
                filePath: z.string().describe("Relative file path to the file (e.g., src/index.ts)") 
            })
        },
        async ({repoPath, filePath}) => {
            try {
                const full_path = path.join(repoPath, filePath);
                const content = fs.readFileSync(full_path, "utf-8");
                return {
                    content: [{ type: "text" as const, text: content }]
                };
            }
            catch (error: any) {
                return {
                    content: [{ type: "text" as const, text: `Error reading file: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}

function registerReadLargeFile(server: McpServer) {
    // Tool can read a chunk of a large code file by line range
    server.registerTool(
        "read_local_file_chunk",
        {
            title: "Read Large File by Line Range",
            description: "Reads a specific line range from a large file. Use startLine and endLine to fetch only the section you need, reducing memory usage and context size.",
            inputSchema: z.object({
                repoPath: z.string().describe("Github repository base path"),
                filePath: z.string().describe("Relative file path to the file (e.g., src/index.ts)"),
                startLine: z.number().int().min(1).describe("Starting line number (1-indexed)"),
                endLine: z.number().int().min(1).describe("Ending line number (1-indexed, inclusive)"),
                maxLines: z.number().int().min(1).optional().default(1000).describe("Maximum lines to return per request. Defaults to 1000.")
            })
        },
        async ({repoPath, filePath, startLine, endLine, maxLines}) => {
            try {
                const full_path = path.join(repoPath, filePath);
                
                // Validate line range
                if (startLine > endLine) {
                    return {
                        content: [{ type: "text" as const, text: "Error: startLine cannot be greater than endLine" }],
                        isError: true
                    };
                }
                
                if (endLine - startLine + 1 > maxLines) {
                    return {
                        content: [{ type: "text" as const, text: `Error: Line range exceeds maxLines limit of ${maxLines}. Requested ${endLine - startLine + 1} lines.` }],
                        isError: true
                    };
                }

                const readline = await import('readline');
                const fileStream = fs.createReadStream(full_path, { encoding: 'utf-8' });
                const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

                const lines: string[] = [];
                let currentLineNum = 0;
                let totalLines = 0;

                for await (const line of rl) {
                    currentLineNum++;
                    totalLines++;
                    if (currentLineNum >= startLine && currentLineNum <= endLine) {
                        lines.push(line);
                    }
                    if (currentLineNum > endLine) break;
                }

                rl.close();

                if (lines.length === 0) {
                    return {
                        content: [{ type: "text" as const, text: `No lines found in range ${startLine}-${endLine}. File has ${totalLines} lines.` }]
                    };
                }

                const result = `Lines ${startLine}-${endLine} (Total lines in file: ${totalLines}):\n\n${lines.map((l, i) => `${startLine + i}: ${l}`).join('\n')}`;

                return {
                    content: [{ type: "text" as const, text: result }]
                };
            }
            catch (error: any) {
                return {
                    content: [{ type: "text" as const, text: `Error reading file: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}


export const fileSystemTools = {
    registerReadSmallFile,
    registerReadLargeFile
}