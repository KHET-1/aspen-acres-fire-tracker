import { joinSession } from "@github/copilot-sdk/extension";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;
const KEY_FILES = [
    "README.md",
    "index.html",
    ".github/copilot-instructions.md",
    ".github/extensions/push-deploy-tool/extension.mjs",
];

async function run(command, cwd) {
    const { stdout, stderr } = await execAsync(command, {
        cwd,
        maxBuffer: 1024 * 1024 * 8,
    });
    return [stdout, stderr].filter(Boolean).join("\n").trim();
}

async function runFile(cmd, args, cwd) {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
        cwd,
        maxBuffer: 1024 * 1024 * 8,
    });
    return [stdout, stderr].filter(Boolean).join("\n").trim();
}

function ensureSafeRef(value, label) {
    if (!value || !SAFE_REF.test(value) || value.includes("..") || value.startsWith("-")) {
        throw new Error(`Invalid ${label}: ${value}`);
    }
}

function extractVercelUrl(text) {
    const match = String(text || "").match(/https?:\/\/[^\s]+\.vercel\.app[^\s]*/g);
    return match?.[match.length - 1] || null;
}

async function getWorkspaceSnapshot(cwd) {
    const [branch, statusShort] = await Promise.all([
        run("git --no-pager branch --show-current", cwd),
        run("git --no-pager status --short", cwd),
    ]);
    const keyFiles = [];
    for (const rel of KEY_FILES) {
        try {
            await fs.access(path.join(cwd, rel));
            keyFiles.push(rel);
        } catch {}
    }
    return {
        cwd,
        branch: branch.trim() || "(detached)",
        dirty: Boolean(statusShort.trim()),
        statusShort: statusShort.trim() || "(clean)",
        keyFiles,
    };
}

const session = await joinSession({
    hooks: {
        onSessionStart: async () => {
            await session.log("push-deploy-tool loaded");
        },
    },
    tools: [
        {
            name: "workspace_push_and_deploy",
            description:
                "Pushes the current branch and optionally deploys to Vercel from this workspace",
            parameters: {
                type: "object",
                properties: {
                    push: {
                        type: "boolean",
                        description: "Run git push",
                        default: true,
                    },
                    deploy: {
                        type: "boolean",
                        description: "Run Vercel deploy after pushing",
                        default: true,
                    },
                    remote: {
                        type: "string",
                        description: "Git remote name",
                        default: "origin",
                    },
                    branch: {
                        type: "string",
                        description: "Branch to push (defaults to current branch)",
                    },
                    prod: {
                        type: "boolean",
                        description: "Deploy production build (vercel --prod)",
                        default: true,
                    },
                },
                additionalProperties: false,
            },
            handler: async (args) => {
                const cwd = process.cwd();
                const push = args?.push ?? true;
                const deploy = args?.deploy ?? true;
                const remote = args?.remote || "origin";
                const prod = args?.prod ?? true;

                const parts = [];
                const currentBranch = (
                    await run("git --no-pager branch --show-current", cwd)
                ).trim();
                const branch = args?.branch || currentBranch;
                ensureSafeRef(remote, "remote");
                ensureSafeRef(branch, "branch");

                if (push) {
                    await session.log(`Pushing ${branch} to ${remote}...`);
                    const pushOut = await runFile("git", ["push", remote, branch], cwd);
                    parts.push(`## git push\n${pushOut || "push completed"}`);
                }

                if (deploy) {
                    await session.log("Running Vercel deploy...");
                    const deployArgs = prod
                        ? ["--yes", "vercel", "--prod", "--yes"]
                        : ["--yes", "vercel", "--yes"];
                    const deployOut = await runFile("npx", deployArgs, cwd);
                    const url = extractVercelUrl(deployOut);
                    parts.push(
                        `## vercel deploy\n${deployOut || "deploy completed"}${url ? `\n\ndeployment_url: ${url}` : ""}`,
                    );
                }

                if (!push && !deploy) {
                    return "No action requested (both push and deploy are false).";
                }

                return parts.join("\n\n");
            },
        },
        {
            name: "workspace_context_snapshot",
            description:
                "Returns a compact workspace snapshot to help future agents navigate this repo quickly",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
            handler: async () => {
                const snapshot = await getWorkspaceSnapshot(process.cwd());
                return [
                    "## workspace snapshot",
                    `cwd: ${snapshot.cwd}`,
                    `branch: ${snapshot.branch}`,
                    `dirty: ${snapshot.dirty ? "yes" : "no"}`,
                    "",
                    "## git status",
                    snapshot.statusShort,
                    "",
                    "## key files",
                    snapshot.keyFiles.length ? snapshot.keyFiles.join("\n") : "(none found)",
                ].join("\n");
            },
        },
    ],
});
