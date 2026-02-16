import type { DialogManager } from "$lib/base/dialog/DialogManager";
import type { Disposable } from "$lib/base/disposable";
import { Emitter } from "$lib/base/events"
import type { TypedEvent } from "$lib/base/events/events";
import type { ResourceLinkContext } from "$lib/base/resourceCtx";
import type { ExtensionAPI, FSProviderAPI } from "$lib/emulator/types";
import { SrcControlGit } from "$lib/git";
import { ConstructExtendablePromise, type ExtendablePromise } from "$lib/utils";
import path from "path";
import { createContext } from "svelte";
import * as toml from 'smol-toml';
interface PTerminal {
    textEv: TypedEvent<string>;
    onResizeNeeded: TypedEvent<void>;
    write(data: string): void;
}
export interface Notification {

    title: string;
    label: string;
    progress?: {
        progressEmitter: Emitter<void>,
        percent?: number
    }
};
export interface NotificationWithID extends Notification {
    id: string;
}
export class StatusBar {
    notifications: NotificationWithID[] = [];
    onNotificationListChangedEmitter: Emitter<void> = new Emitter();
    addNotification(notif: Notification): Disposable {
        let notId = crypto.randomUUID();
        this.notifications.push({ id: notId, ...notif });
        this.onNotificationListChangedEmitter.emit();
        return {
            dispose: () => {

                this.notifications = this.notifications.filter(v => v.id !== notId);
                this.onNotificationListChangedEmitter.emit();
            },
        }
    }

}
interface FileConfig {
    github_link?: {
        owner: string;
        repo: string;
    };
}
export class PageAPI {
    readonly statusBar = new StatusBar();
    rc: ResourceLinkContext;
    rootURL: string;
    async getFromPat(pat: string) {
        return await SrcControlGit.fromPat(await this.fs, pat);
    }
    dialogManager: DialogManager | null = null;
    constructor(rc: ResourceLinkContext, rootURL = "file:///", dialogManager: DialogManager | null = null) {
        this.rc = rc;
        this.rootURL = rootURL;
        this.dialogManager = dialogManager;
    }
    resizeAll() {
        this.#terminals.forEach(v => {

        })
    }
    _fileconfig?: FileConfig;
    get fileconfig() {
        return new Promise<FileConfig>(async (resolve) => {
            
            try {

                let fs = await this.fs;
                let asLarge = await fs.readLargeFile(path.resolve(new URL(this.rootURL).pathname, "cryolabs.conf"));
                this._fileconfig = toml.parse(await asLarge.text())
                resolve(this._fileconfig);
            } catch {
                resolve({});
            }
        })
    }
    get rootPath() {
        return new URL(this.rootURL).pathname;
    }
    async setFileConfig(s: FileConfig) {
        return navigator.locks.request("config-lock", async () => {
            let fs = await this.fs;
            try {
                await fs.createFile(path.resolve(this.rootPath, "cryolabs.conf"));
            } catch {

            }
            this._fileconfig = {...s};
            await fs.writeFile(path.resolve(this.rootPath, "cryolabs.conf"), new TextEncoder().encode(toml.stringify(s as toml.TomlTable)).buffer);

        });
    }
    #onAllLoadedEmitter = new Emitter<void>();
    emitAllLoaded() {
        this.#onAllLoadedEmitter.emit();
    }
    onAllLoaded = this.#onAllLoadedEmitter.event;
    #terminals: ({ id: string, term: PTerminal })[] = [];
    getTerminal(id: string) {
        return this.#terminals.filter(v => v.id === id)[0];
    }
    addTerminal(id: string, term: PTerminal) {
        this.#terminals.push({
            id, term
        });
    }

    showTerminal(id: string) {
        this.openLink(`term:///${id}`, "tabs_lower");
    }
    openLink(link: string, target = "_blank") {
        this.rc.openLink(link, target);
    }
    fsPromise: ExtendablePromise<FSProviderAPI> = ConstructExtendablePromise();
    extPromise: ExtendablePromise<ExtensionAPI> = ConstructExtendablePromise();
    get ext() {
        return this.extPromise.promise;
    }
    get fs() {
        return this.fsPromise.promise;
    }

}
export const [usePageAPI, setPageAPI] = createContext<PageAPI>();