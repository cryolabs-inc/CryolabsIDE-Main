import type { FSProviderAPI } from "$lib/emulator/types";
import type { AutocompleteProvider, AutocompleteSuggestion } from "$lib/base/dialog/DialogManager";
import { S_IFDIR, S_IFMT } from "@zenfs/core/constants.js";
import {Octokit} from 'octokit';
import p from "path";
interface Ghctx {
    kit: Octokit;
    rootPath: string;
    username: string;
    reponame: string;
    fs: FSProviderAPI;
}
interface GtreeEntry {
    path: string;
    mode: string;
    type: string;
    sha: string;
}

async function ct(ghCtx: Ghctx, fs: FSProviderAPI, path: string) {
  let fstat = await fs.stat(path);
  let isDirectory = (fstat.mode & S_IFMT) === S_IFDIR; 
  let {kit} = ghCtx;
  let currentElement = {
    path: path.split('/').slice(-1)[0],
    mode: isDirectory ? "040000" : "100644",
    type: isDirectory ? "tree" : "blob",
    sha: "",
    content: undefined
  };
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
    let b = Buffer.from(ab).toString('base64');
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
async function craftTree(gitCtx: Ghctx, cb: (gitCtx: Ghctx, fs: FSProviderAPI, path: string) => Promise<any> | any, path = gitCtx.rootPath, o = [] as any[]) {

  let arr = await gitCtx.fs.readdir(path);

  for (let s of arr) {
    o.push(await cb(gitCtx, gitCtx.fs, p.resolve(path, s)));

  }
  return o;
}

export class SrcControlGit {
    fs: FSProviderAPI;
    octokit?: Octokit;
    repo: string|null = null;
    owner: string|null = null; 
    static fromPat(fs: FSProviderAPI, pat: string) {
        let scgit = new SrcControlGit(fs);
        scgit.octokit = new Octokit({
            auth: pat
        });
        return scgit;
    }
    setRepo(repo: string) {
        this.repo = repo;
    }
    setOwner(owner:string) {
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
    async push(path: string) {
        let gctx = this.getGitCtx(path);
        await craftTree(gctx, ct);
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