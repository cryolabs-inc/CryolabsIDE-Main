import type { FSProviderAPI } from "$lib/emulator/types";
import type { AutocompleteProvider, AutocompleteSuggestion } from "$lib/base/dialog/DialogManager";
import { S_IFDIR, S_IFMT } from "@zenfs/core/constants.js";
import { Octokit } from 'octokit';
import p from "path";
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
    let fstat = await fs.stat(path);
    let isDirectory = (fstat.mode & S_IFMT) === S_IFDIR;
    let { kit } = ghCtx;
    let currentElement = {
        path: p.basename(path),
        mode: isDirectory ? "040000" : "100644",
        type: isDirectory ? "tree" : "blob",
        sha: "",
        content: undefined
    } as GtreeEntry;
    if (isDirectory) {
        // get the sha file;
        let theTree = await craftTree(ghCtx, ct, path);
        let reqObject = {
            tree: theTree
        };
        // let r = await githubApiRequest(ghCtx.ghApiToken, 'POST', `/repos/${ghCtx.owner}/${ghCtx.repo}/git/trees`, reqObject);
        let r = await kit.request("POST /repos/{owner}/{repo}/git/trees", {
            owner: ghCtx.username,
            repo: ghCtx.reponame,
            ...reqObject
        });
        currentElement.sha = r.data.sha;
    }
    else {
        let d = await fs.readLargeFile(path);
        let ab = await d.arrayBuffer();
        let b = Buffer.Buffer.from(ab).toString('base64');
        let bsha = await kit.request("POST /repos/{owner}/{repo}/git/blobs", {
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

    let arr = await gitCtx.fs.readdir(path);

    for (let s of arr) {
        o.push(await cb(gitCtx, gitCtx.fs, p.resolve(path, s)));

    }
    return o;
}

export class SrcControlGit {
    fs: FSProviderAPI;
    octokit?: Octokit;
    repo: string | null = null;
    owner: string | null = null;
    static async fromPat(fs: FSProviderAPI, pat: string) {
        let scgit = new SrcControlGit(fs);
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
    setRepo(repo: string) {
        this.repo = repo;
    }
    setOwner(owner: string) {
        this.owner = owner;
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
        let gctx = this.getGitCtx(path);
        let { kit } = gctx;
        let rootTree = await ct(gctx, this.fs, path);
        if (!rootTree.sha) {
            throw new Error("SHA failed to commit.");
        }
        let refData = await kit.rest.git.getRef({
            repo: gctx.reponame,
            owner: gctx.username,
            ref: "heads/" + branch

        });

        let nwCom = await kit.rest.git.createCommit({
            owner: gctx.username,
            repo: gctx.reponame,
            message: "Test",
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
            let ok = await confirm("Pull from remote?", "Any unpushed local changes will be lost. Do you want to continue?");
            if (!ok) return;
        }

        let gctx = this.getGitCtx(path);
        let { kit, reponame: repo, username: owner } = gctx;
        let r = await kit.rest.git.getRef({
            repo,
            owner,
            ref: "heads/" + branch
        });
        let sha = commitSha ?? r.data.object.sha;
        let commit = await kit.rest.git.getCommit({
            commit_sha: sha,
            repo,
            owner
        });
        let ctree = commit.data.tree.sha;
        let t = await kit.rest.git.getTree({
            owner,
            repo,
            tree_sha: ctree,
            recursive: "true"
        });

        // Delete existing contents to prevent stale files
        let existing = await this.fs.readdir(path);
        for (let entry of existing) {
            let fullPath = p.resolve(path, entry);
            try {
                await this.fs.removeDirectory(fullPath, { recursive: true });
            } catch {
                try {
                    await this.fs.removeEntry(fullPath);
                } catch { }
            }
        }

        // Create directories first
        for (let it of t.data.tree) {
            if (it.type === "tree" && it.path) {
                let fullPath = p.resolve(path, it.path);
                try {
                    await this.fs.mkdir(fullPath, { recursive: true });
                } catch { }
            }
        }

        // Then write blobs
        for (let it of t.data.tree) {
            if (it.type === "blob" && it.path && it.sha) {
                let fullPath = p.resolve(path, it.path);
                // Ensure parent directory exists
                let parentDir = p.dirname(fullPath);
                try {
                    await this.fs.mkdir(parentDir, { recursive: true });
                } catch { }

                let blob = await kit.rest.git.getBlob({
                    owner,
                    repo,
                    file_sha: it.sha
                });
                let content: Uint8Array;
                if (blob.data.encoding === "base64") {
                    let binary = atob(blob.data.content);
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