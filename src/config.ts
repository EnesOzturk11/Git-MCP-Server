import { process } from "zod/v4/core" 
import { env } from "node:process"

export const config = {
    TOKEN: process.env.GITHUB_TOKEN,
    CACHE_STALE_INTERVAL: 1 * 60 * 60 * 1000, // 1 hour stale time for data in the server cache
}
