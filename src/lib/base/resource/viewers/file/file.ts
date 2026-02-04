import { Emitter, type TypedEvent } from "$lib/base/events/events";
import { TreeItem, type Action, type TreeDataProvider } from "$lib/base/trees/tree";
import type { PageAPI } from "$lib/components/base/panel/apis/PageAPI";
import type { FSProviderAPI } from "$lib/emulator/types";
import { Download, DownloadIcon, FileIcon, FilePlusIcon, FolderPlusIcon, TrashIcon } from "@lucide/svelte";
import { O_EXCL, S_IFDIR, S_IFMT } from "@zenfs/core/constants.js";
import { DirType } from "@zenfs/core/vfs/dir.js";
import path from "path";

export class FileEntry extends TreeItem {
    filePath: string;

    constructor(filePath: string, type: "directory" | "file", papi: PageAPI, isRootElement = false) {
        super(path.basename(filePath), type + " on " + filePath);
        this.filePath = filePath;
        if (path.basename(filePath).startsWith(".")) {
            this.isHidden = true;
        }
        if (type === "file") {
            this.link = {
                href: "file://" + filePath,
                target: "_blank",
            };
            this.actions = [{
                async callback(t) {
                    let f = await papi.fs;
                    await f.removeEntry(filePath);
                },
                label: "Delete file",
                icon: TrashIcon,
                id: "delete-file"
            }, {
                async callback() {
                    let f = await papi.fs;
                    let rlf = await f.readLargeFile(filePath);
                    let u = URL.createObjectURL(rlf);
                    let aElem = document.createElement('a');
                    aElem.href = u;
                    aElem.download = path.basename(filePath);
                    aElem.click();
                },
                label: "Download file",
                icon: DownloadIcon,
                id: "download-file"
            }, {
                async callback(tdp) {
                    let ft = tdp as FT;
                    ft.rename(filePath);
                },
                label: "Rename file",
                id: "rename-file"
            }]
            this.prio = 1;
        }
        else {

            this.actions = [
                {
                    async callback(t) {

                        let ft = t as FT;
                        let f = await papi.fs;
                        let nwPath = path.resolve(filePath, "new dir " + crypto.randomUUID());
                        await f.mkdir(nwPath, { recursive: false });
                        setTimeout(() => {
                            ft.rename(nwPath);
                        }, 100);
                    },
                    label: "Create new directory",
                    id: "create-directory",
                    icon: FolderPlusIcon
                },
                {
                    async callback(treeDataProvider, treeItem, hbe) {
                        console.log("nwfile");
                        let ft = treeDataProvider as FT;
                        let f = await papi.fs;
                        let nwPath = path.resolve(filePath, "new dir " + crypto.randomUUID());
                        await f.createFile(nwPath);
                        
                        setTimeout(()=>{
                            ft.rename(nwPath);  
                        },100);
                    },
                    label: "Create new file",
                    id: "create-file",
                    icon: FilePlusIcon
                }
            ];

            if (!isRootElement) {
                this.actions.push({
                    async callback(t) {
                        if (isRootElement) {
                            return;
                        }
                        let f = await papi.fs;
                        await f.removeDirectory(filePath, { recursive: true });
                    },
                    label: "Remove directory",
                    id: "remove-directory"
                });
            }
            this.prio = 0;
        }

    }
}



export class FT implements TreeDataProvider<FileEntry> {
    rootLabel?: string | undefined = "ROOT DIRECTORY";
    fsApi: FSProviderAPI;
    pageApi: PageAPI;
    selectedEntries: Set<string> = new Set(); // Store file paths
    lastSelectedEntry?: FileEntry;
    allEntries: FileEntry[] = []; // Keep track of all entries for range selection
    #onStateShouldChange: Emitter<{ path: string, state: "rename" }> = new Emitter();
    onStateShouldChange = this.#onStateShouldChange.event;
    rootActions: Action<FileEntry>[] = [];

    rename(path: string) {
        this.#onStateShouldChange.emit({ path, state: "rename" });
    }
    get onSelected() {
        return this.#selectedEvt.event;
    }
    #selectedEvt: Emitter<{ selectedPaths: Set<string> }> = new Emitter();

    changeSelected(entry: FileEntry, mode: 'single' | 'add' | 'range' = 'single') {
        if (mode === 'single') {
            this.selectedEntries.clear();
            this.selectedEntries.add(entry.filePath);
            this.lastSelectedEntry = entry;
        } else if (mode === 'add') {
            if (this.selectedEntries.has(entry.filePath)) {
                this.selectedEntries.delete(entry.filePath);
            } else {
                this.selectedEntries.add(entry.filePath);
            }
            this.lastSelectedEntry = entry;
        } else if (mode === 'range' && this.lastSelectedEntry) {
            // Range selection: select all entries between last and current
            const lastIdx = this.allEntries.findIndex(e => e.filePath === this.lastSelectedEntry?.filePath);
            const currentIdx = this.allEntries.findIndex(e => e.filePath === entry.filePath);

            if (lastIdx !== -1 && currentIdx !== -1) {
                const start = Math.min(lastIdx, currentIdx);
                const end = Math.max(lastIdx, currentIdx);

                for (let i = start; i <= end; i++) {
                    this.selectedEntries.add(this.allEntries[i].filePath);
                }
            }
        }

        this.#selectedEvt.emit({ selectedPaths: this.selectedEntries });
    }

    registerEntry(entry: FileEntry, index?: number) {
        const existingIdx = this.allEntries.findIndex(e => e.filePath === entry.filePath);

        if (existingIdx !== -1) {
            // Remove from current position if already registered
            this.allEntries.splice(existingIdx, 1);
        }

        if (index !== undefined && index >= 0) {
            // Insert at specified position
            this.allEntries.splice(index, 0, entry);
        } else {
            // Append to end if no index specified
            this.allEntries.push(entry);
        }
    }

    unregisterEntry(entry: FileEntry) {
        const idx = this.allEntries.findIndex(e => e.filePath === entry.filePath);
        if (idx !== -1) {
            this.allEntries.splice(idx, 1);
        }
    }

    getContextMenuActions(entries: FileEntry[]): Action<FileEntry>[] {
        if (entries.length === 0) return [];

        if (entries.length === 1) {
            // Single selection - return the entry's own actions
            return entries[0].actions;
        }

        // Multiple selection - return bulk actions
        const actions: Action<FileEntry>[] = [];

        // Check if all are files
        const allFiles = entries.every(e => e.link !== undefined);

        // Delete multiple items
        actions.push({
            async callback(tdp) {
                const ft = tdp as FT;
                const f = await ft.pageApi.fs;
                for (const entry of entries) {
                    if (entry.link) {
                        // It's a file
                        await f.removeEntry(entry.filePath);
                    } else {
                        // It's a directory
                        await f.removeDirectory(entry.filePath, { recursive: true });
                    }
                }
                ft.selectedEntries.clear();
                ft.#selectedEvt.emit({ selectedPaths: ft.selectedEntries });
            },
            label: `Delete ${entries.length} items`,
            icon: TrashIcon,
            id: "delete-multiple"
        });

        // Download multiple files (only if all selections are files)
        if (allFiles) {
            actions.push({
                async callback(tdp) {
                    const ft = tdp as FT;
                    const f = await ft.pageApi.fs;
                    for (const entry of entries) {
                        const rlf = await f.readLargeFile(entry.filePath);
                        const u = URL.createObjectURL(rlf);
                        const aElem = document.createElement('a');
                        aElem.href = u;
                        aElem.download = path.basename(entry.filePath);
                        aElem.click();
                    }
                },
                label: `Download ${entries.length} files`,
                icon: DownloadIcon,
                id: "download-multiple"
            });
        }

        return actions;
    }

    constructor(fsApi: FSProviderAPI, pageAPI: PageAPI, rootFileEntry: FileEntry) {
        this.fsApi = fsApi;
        this.pageApi = pageAPI;
        this.rootActions = [{
            async callback(treeDataProvider, treeItem, hbe) {
                let genName = "new " + crypto.randomUUID();
                let genPath = path.resolve(rootFileEntry.filePath, genName);
                let wf = await fsApi.writeFile(genPath, new Uint8Array(0).buffer, 0, 0, O_EXCL);
                let ft = treeDataProvider as FT;
                ft.rename(genPath);
            },
            label: "New file",
            icon: FileIcon,
            id: "new-file"
        }];
    }
    async init() {

    }
    getTreeItem(el: FileEntry): TreeItem {
        return el;
    }
    async getChildren(el: FileEntry): Promise<FileEntry[] | null> {
        let st = await this.fsApi.stat(el.filePath);
        if ((st.mode & S_IFMT) === S_IFDIR) {
            return (await this.fsApi.ls(el.filePath)).map((v) => {
                return new FileEntry(
                    path.resolve(el.filePath, v.name),
                    v.dt_type === DirType.DIR ? "directory" : "file", this.pageApi
                );
            });
        }
        // otherwise
        return null; // this is a leaf node.
    }
}
