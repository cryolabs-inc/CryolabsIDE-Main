import { Emitter, type TypedEvent } from "$lib/base/events/events";
import { TreeItem, type TreeDataProvider } from "$lib/base/trees/tree";
import type { PageAPI } from "$lib/components/base/panel/apis/PageAPI";
import type { FSProviderAPI } from "$lib/emulator/types";
import { Download, DownloadIcon, TrashIcon } from "@lucide/svelte";
import { S_IFDIR, S_IFMT } from "@zenfs/core/constants.js";
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
                        }, 10);
                    },
                    label: "Create new directory",
                    id: "create-directory"
                }
            ]
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
        }

    }
}



export class FT implements TreeDataProvider<FileEntry> {
    rootLabel?: string | undefined = "ROOT DIRECTORY";
    fsApi: FSProviderAPI;
    pageApi: PageAPI;
    selectedEntry?: FileEntry;
    #onStateShouldChange: Emitter<{ path: string, state: "rename" }> = new Emitter();
    onStateShouldChange = this.#onStateShouldChange.event;
    rename(path: string) {
        this.#onStateShouldChange.emit({ path, state: "rename" });
    }
    get onSelected() {
        return this.#selectedEvt.event;
    }
    #selectedEvt: Emitter<{ newEnt: FileEntry }> = new Emitter();
    changeSelected(entry: FileEntry) {
        this.selectedEntry = entry;
        this.#selectedEvt.emit({ newEnt: entry });
    }
    constructor(fsApi: FSProviderAPI, pageAPI: PageAPI) {
        this.fsApi = fsApi;
        this.pageApi = pageAPI;
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
