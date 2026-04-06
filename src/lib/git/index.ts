import type { FSProviderAPI } from "$lib/emulator/types";
import type { AutocompleteProvider, AutocompleteSuggestion } from "$lib/base/dialog/DialogManager";
import { Emitter } from "$lib/base/events";
import { S_IFDIR, S_IFMT } from "@zenfs/core/constants.js";
import { Octokit } from 'octokit';
import p from "path-browserify";
import Buffer from 'buffer';
interface Ghctx {
    kit: Octokit;
    rootPath: string;
    username: string;
    reponame: string;
    fs: FSProviderAPI;
}
interface GtreeEntry {
    path?: string;
    mode?: "100644" | "100755" | "040000" | "160000" | "120000";
    type?: "blob" | "tree" | "commit";
    sha?: string | null;
    content?: string;
}

async function ct(ghCtx: Ghctx, fs: FSProviderAPI, path: string) {
    const fstat = await fs.stat(path);
    const isDirectory = (fstat.mode & S_IFMT) === S_IFDIR;
    const { kit } = ghCtx;
    const currentElement = {
        path: p.basename(path),
        mode: isDirectory ? "040000" : "100644",
        type: isDirectory ? "tree" : "blob",
        sha: "",
        content: undefined
    } as GtreeEntry;
    if (isDirectory) {
        // get the sha file;
        const theTree = await craftTree(ghCtx, ct, path);
        const reqObject = {
            tree: theTree
        };
        // let r = await githubApiRequest(ghCtx.ghApiToken, 'POST', `/repos/${ghCtx.owner}/${ghCtx.repo}/git/trees`, reqObject);
        const r = await kit.request("POST /repos/{owner}/{repo}/git/trees", {
            owner: ghCtx.username,
            repo: ghCtx.reponame,
            ...reqObject
        });
        currentElement.sha = r.data.sha;
    }
    else {
        const d = await fs.readLargeFile(path);
        const ab = await d.arrayBuffer();
        const b = Buffer.Buffer.from(ab).toString('base64');
        const bsha = await kit.request("POST /repos/{owner}/{repo}/git/blobs", {
            owner: ghCtx.username,
            repo: ghCtx.reponame,
            content: b,
            encoding: "base64"
        });
        currentElement.sha = bsha.data.sha;
    }
    return currentElement;
}

/**
 * 
 * @param githubContext Github Context
 * @param currentPath Current path
 * @returns Tree sha
 */
async function craftTree(gitCtx: Ghctx, cb: (gitCtx: Ghctx, fs: FSProviderAPI, path: string) => Promise<GtreeEntry> | GtreeEntry, path = gitCtx.rootPath, o = [] as GtreeEntry[]) {

    const arr = await gitCtx.fs.readdir(path);

    for (const s of arr) {
        o.push(await cb(gitCtx, gitCtx.fs, p.join(path, s)));

    }
    return o;
}

export class SrcControlGit {
    fs: FSProviderAPI;
    octokit?: Octokit;
    repo: string | null = null;
    owner: string | null = null;
    static async fromPat(fs: FSProviderAPI, pat: string) {
        const scgit = new SrcControlGit(fs);
        scgit.octokit = new Octokit({
            auth: pat
        });
        if (!(await scgit.validate())) {
            return undefined;
        }
        return scgit;
    }
    async validate(): Promise<boolean> {
        try {
            if (!this.octokit) {
                return false;
            }
            await this.octokit.rest.users.getAuthenticated()
            return true;
        } catch {
            return false;
        }
    }
    async getLogin(): Promise<string | null> {
        if (!this.octokit) return null;
        try {
            const { data } = await this.octokit.rest.users.getAuthenticated();
            return data.login;
        } catch {
            return null;
        }
    }
    repoChangeEmitter?: Emitter<{ owner: string; repo: string }>;
    setRepo(repo: string) {
        this.repo = repo;
        if (this.owner && this.repo) this.repoChangeEmitter?.emit({ owner: this.owner, repo: this.repo });
    }
    setOwner(owner: string) {
        this.owner = owner;
        if (this.owner && this.repo) this.repoChangeEmitter?.emit({ owner: this.owner, repo: this.repo });
    }
    constructor(fs: FSProviderAPI) {
        this.fs = fs;
    }
    getGitCtx(rootPath: string): Ghctx {
        if (!this.owner || !this.repo || !this.octokit) {
            throw new Error("");
        }
        return {
            fs: this.fs,
            kit: this.octokit,
            reponame: this.repo,
            username: this.owner,
            rootPath
        };
    }
    async push(path: string, branch: string = "main", message: string = "No message entered") {
        const gctx = this.getGitCtx(path);
        const { kit } = gctx;
        const rootTree = await ct(gctx, this.fs, path);
        if (!rootTree.sha) {
            throw new Error("SHA failed to commit.");
        }
        const refData = await kit.rest.git.getRef({
            repo: gctx.reponame,
            owner: gctx.username,
            ref: "heads/" + branch

        });

        const nwCom = await kit.rest.git.createCommit({
            owner: gctx.username,
            repo: gctx.reponame,
            message,
            tree: rootTree.sha,
            parents: [refData.data.object.sha]
        });
        await kit.rest.git.updateRef({
            ref: "heads/" + branch,
            repo: gctx.reponame,
            owner: gctx.username,
            "sha": nwCom.data.sha
        });

    }
    async pull(path: string, branch: string = "main", commitSha?: string, confirm?: (title: string, message: string) => Promise<boolean>) {
        if (confirm) {
            const ok = await confirm("Pull from remote?", "Any unpushed local changes will be lost. Do you want to continue?");
            if (!ok) return;
        }

        const gctx = this.getGitCtx(path);
        const { kit, reponame: repo, username: owner } = gctx;
        const r = await kit.rest.git.getRef({
            repo,
            owner,
            ref: "heads/" + branch
        });
        const sha = commitSha ?? r.data.object.sha;
        const commit = await kit.rest.git.getCommit({
            commit_sha: sha,
            repo,
            owner
        });
        const ctree = commit.data.tree.sha;
        const t = await kit.rest.git.getTree({
            owner,
            repo,
            tree_sha: ctree,
            recursive: "true"
        });

        // Delete existing contents to prevent stale files
        try {
        await this.fs.removeDirectory(path, {recursive: true});
        } catch {}
await this.fs.mkdir(path, {recursive: true});
        // Create directories first
        for (const it of t.data.tree) {
            if (it.type === "tree" && it.path) {
                const fullPath = p.join(path, it.path);
                try {
                    await this.fs.mkdir(fullPath, { recursive: true });
                } catch { }
            }
        }

        // Then write blobs
        for (const it of t.data.tree) {
            if (it.type === "blob" && it.path && it.sha) {
                const fullPath = p.join(path, it.path);
                // Ensure parent directory exists
                const parentDir = p.dirname(fullPath);
                try {
                    await this.fs.mkdir(parentDir, { recursive: true });
                } catch { }

                const blob = await kit.rest.git.getBlob({
                    owner,
                    repo,
                    file_sha: it.sha
                });
                let content: Uint8Array;
                if (blob.data.encoding === "base64") {
                    const binary = atob(blob.data.content);
                    content = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        content[i] = binary.charCodeAt(i);
                    }
                } else {
                    content = new TextEncoder().encode(blob.data.content);
                }
                await this.fs.writeFile(fullPath, content.buffer as ArrayBuffer, content.byteLength, 0);
            }
        }
    }

    /**
     * Creates an autocomplete provider for GitHub repositories
     * Searches user's repos and optionally public repos
     */
    getRepoAutocomplete(): AutocompleteProvider {
        const octokit = this.octokit;
        if (!octokit) {
            throw new Error("Octokit not initialized. Call fromPat first.");
        }

        return {
            async getSuggestions(input: string): Promise<AutocompleteSuggestion[]> {
                if (!input || input.length < 2) {
                    // Return user's repos when no input
                    try {
                        const { data: repos } = await octokit.request('GET /user/repos', {
                            per_page: 10,
                            sort: 'updated'
                        });
                        return repos.map(repo => ({
                            value: repo.full_name,
                            label: repo.full_name,
                            description: repo.description || (repo.private ? 'Private' : 'Public')
                        }));
                    } catch {
                        return [];
                    }
                }

                try {
                    // Search repositories
                    const { data } = await octokit.request('GET /search/repositories', {
                        q: input,
                        per_page: 10,
                        sort: 'stars'
                    });
                    return data.items.map(repo => ({
                        value: repo.full_name,
                        label: repo.full_name,
                        description: repo.description || `★ ${repo.stargazers_count}`
                    }));
                } catch {
                    return [];
                }
            }
        };
    }

    /**
     * Creates an autocomplete provider for branches in a repository
     */
    getBranchAutocomplete(owner: string, repo: string): AutocompleteProvider {
        const octokit = this.octokit;
        if (!octokit) {
            throw new Error("Octokit not initialized. Call fromPat first.");
        }

        return {
            async getSuggestions(input: string): Promise<AutocompleteSuggestion[]> {
                try {
                    const { data: branches } = await octokit.request('GET /repos/{owner}/{repo}/branches', {
                        owner,
                        repo,
                        per_page: 30
                    });

                    const filtered = input
                        ? branches.filter(b => b.name.toLowerCase().includes(input.toLowerCase()))
                        : branches;

                    return filtered.map(branch => ({
                        value: branch.name,
                        label: branch.name,
                        description: branch.protected ? 'Protected' : undefined
                    }));
                } catch {
                    return [];
                }
            }
        };
    }
}