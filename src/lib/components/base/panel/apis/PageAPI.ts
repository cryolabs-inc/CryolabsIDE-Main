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
import * as codemirror from 'codemirror';
import * as codemirror_lsp from '@codemirror/lsp-client';
import { autocompletion } from "@codemirror/autocomplete";
interface PTerminal {
    textEv: TypedEvent<string>;
    onResizeNeeded: TypedEvent<void>;
    write(data: string): void;
}
export interface Notification {
    title: string;
    label: string;
    kind?: "info" | "error";
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
class LanguageClients {
    page_api: PageAPI;
    lang_id_to_client: Map<string, Promise<codemirror_lsp.LSPClient>> = new Map();
    constructor(page_api: PageAPI) {
        this.page_api = page_api;
    }
    async loadLanguageClient(lang_id: string, language_cmd: string, language_cmd_args: string[] = []) {
        let c = this.lang_id_to_client.get(lang_id);
        if (c) {
            return c;
        }
        this.lang_id_to_client.set(lang_id, new Promise(async (resolve) => {
            let cx = await this.page_api.ext;
            let proc = await cx.openProcess(language_cmd, language_cmd_args);
            let s = await proc.streams();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();
            const HEADER_DELIMITER = "\r\n\r\n";
            const reader = s.stdout.getReader();
            const writer = s.stdin.getWriter();
            const stderr_reader = s.stderr.pipeThrough(new TextDecoderStream()).getReader();
            (async()=>{
                while (true) {
                    let res = await stderr_reader.read();
                    if (res.done) {
                        break;
                    }
                    console.error(res.value);
                }
            })()
            class CryolabsTransport implements codemirror_lsp.Transport {
                private handlers = new Set<(value: string) => void>();
                private buf = new Uint8Array(0);

                constructor() {
                    this.readLoop();
                }

                send(message: string): void {
                    console.log(message);
                    const body = encoder.encode(message);
                    const header = encoder.encode(`Content-Length: ${body.byteLength}${HEADER_DELIMITER}`);
                    const packet = new Uint8Array(header.byteLength + body.byteLength);
                    packet.set(header, 0);
                    packet.set(body, header.byteLength);

                    writer.write(packet);
                }

                subscribe(handler: (value: string) => void): void {
                    this.handlers.add(handler);
                }

                unsubscribe(handler: (value: string) => void): void {
                    this.handlers.delete(handler);
                }

                private dispatch(message: string) {
                    console.log("dispatched response: " + message);
                    for (const handler of this.handlers) {
                        handler(message);
                    }
                }

                private parseMessages() {
                    while (true) {
                        const text = decoder.decode(this.buf, { stream: true });
                        const delimIdx = text.indexOf(HEADER_DELIMITER);
                        if (delimIdx === -1) break;

                        const headerSection = text.substring(0, delimIdx);
                        let contentLength = -1;
                        for (const line of headerSection.split("\r\n")) {
                            const match = line.match(/^Content-Length:\s*(\d+)$/i);
                            if (match) {
                                contentLength = parseInt(match[1], 10);
                            }
                        }
                        if (contentLength < 0) break;

                        const headerBytes = encoder.encode(headerSection + HEADER_DELIMITER).byteLength;
                        const totalNeeded = headerBytes + contentLength;
                        if (this.buf.byteLength < totalNeeded) break;

                        const bodyBytes = this.buf.subarray(headerBytes, totalNeeded);
                        this.dispatch(decoder.decode(bodyBytes));
                        this.buf = this.buf.slice(totalNeeded);
                    }
                }

                private async readLoop() {
                    while (true) {
                        const res = await reader.read();
                        if (res.done) break;

                        const old = this.buf;
                        this.buf = new Uint8Array(old.byteLength + res.value.byteLength);
                        this.buf.set(old, 0);
                        this.buf.set(res.value, old.byteLength);
                        this.parseMessages();
                    }
                }
            }
            let ct = new CryolabsTransport();
            let lsp_client =  new codemirror_lsp.LSPClient({
                "extensions": [codemirror_lsp.serverDiagnostics()],
                timeout: 100000,
            
            });
            
            lsp_client.connect(ct);
            proc.wait().then(v=>{
                this.lang_id_to_client.delete(lang_id); // if process dies, this client is no o
            });
            resolve(lsp_client);
        }));
        return this.lang_id_to_client.get(lang_id)!;
    }
}
export class PageAPI {
    readonly statusBar = new StatusBar();
    rc: ResourceLinkContext;
    rootURL: string;
    languageClients: LanguageClients = new LanguageClients(this);
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
            this._fileconfig = { ...s };
            await fs.writeFile(path.resolve(this.rootPath, "cryolabs.conf"), new TextEncoder().encode(toml.stringify(s as toml.TomlTable)).buffer);

        });
    }
    #onAllLoadedEmitter = new Emitter<void>();
    #loadedTriggered = false;
    emitAllLoaded() {
        if (this.#loadedTriggered) return;
        this.#onAllLoadedEmitter.emit();
        this.#loadedTriggered = true;
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