import type { DialogManager } from "$lib/base/dialog/DialogManager";
import {languages} from '@codemirror/language-data'
import type { Disposable } from "$lib/base/disposable";
import { Emitter } from "$lib/base/events"
import type { TypedEvent } from "$lib/base/events/events";
import type { ResourceLinkContext } from "$lib/base/resourceCtx";
import type { ExtensionAPI, FSProviderAPI } from "$lib/emulator/types";
import { SrcControlGit } from "$lib/git";
import { ConstructExtendablePromise, type ExtendablePromise } from "$lib/utils";
import path from "path-browserify";
import { createContext } from "svelte";
import * as toml from 'smol-toml';
import * as codemirror from 'codemirror';
import * as codemirror_lsp from '@codemirror/lsp-client';
import { autocompletion } from "@codemirror/autocomplete";
import type { ResourceResponse } from "$lib/base/resource";
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
        const notId = crypto.randomUUID();
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
type LangConfig = {
    lang_command: string,
    lang_args: string[]
}
class LanguageClients {
    page_api: PageAPI;
    lang_id_to_client: Map<string, Promise<codemirror_lsp.LSPClient>> = new Map();
    lang_id_to_registration: Map<string, LangConfig> = new Map();
    defaultRegistered: Promise<void>;
    constructor(page_api: PageAPI) {
        this.page_api = page_api;
        this.defaultRegistered = this.registerAllConfigs();
    }
    async identifyLanguageId(file_path: string) {
        let ename = path.extname(file_path);
        console.log(languages)
        for (let lang of languages){
            
            if (lang.extensions.filter(v=>ename.substring(1).toLowerCase() ===v.toLowerCase()).length > 0) return {lang_id: lang.name.toLowerCase(), lang_extension: await lang.load(), };
        }
        
        return null;
    }
    async registerAllConfigs() {

        await this.registerConfig("c++", "/usr/bin/clangd", ["--query-driver=/usr/bin/*", "-j=2"]);
        await this.registerConfig("c", "/usr/bin/clangd", ["--query-driver=/usr/bin/*", "-j=2"]);
    }
    async registerConfig(lang_id: string, language_cmd: string, language_cmd_args: string[] = []) {
        this.lang_id_to_registration.set(lang_id, {
            lang_command: language_cmd,
            lang_args: language_cmd_args
        });
    }
    async loadLanguageClient(file_name: string) {
        const ret = await this.identifyLanguageId(file_name);
        if (!ret) return null;
        const {lang_id, lang_extension} = ret;
        console.log(lang_id);
        console.log(this.lang_id_to_registration);
        const c = this.lang_id_to_client.get(lang_id);
        const langRegistration = this.lang_id_to_registration.get(lang_id);
        if (!langRegistration) {
            return null;
        }
        const language_cmd = langRegistration.lang_command;
        const language_cmd_args = langRegistration.lang_args;
        if (c) {
            return {
                lang_extension,
                client: c
            };
        }
        this.lang_id_to_client.set(lang_id, new Promise(async (resolve) => {
            let clT = setTimeout(()=>{
                this.lang_id_to_client.delete(lang_id);
            }, 5000);
            const cx = await this.page_api.ext;
            const proc = await cx.openProcess(language_cmd, language_cmd_args);
            
            const s = await proc.streams();
            clearTimeout(clT);
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();
            const HEADER_DELIMITER = "\r\n\r\n";
            const reader = s.stdout.getReader();
            const writer = s.stdin.getWriter();
            const stderr_reader = s.stderr.pipeThrough(new TextDecoderStream()).getReader();
            (async()=>{
                while (true) {
                    const res = await stderr_reader.read();
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
            const ct = new CryolabsTransport();
            const lsp_client =  new codemirror_lsp.LSPClient({
                "extensions": [codemirror_lsp.serverDiagnostics()],
                timeout: 100000,
            
            });
            
            lsp_client.connect(ct);
            proc.wait().then(v=>{
                this.lang_id_to_client.delete(lang_id); // if process dies, this client is no o
            });
            resolve(lsp_client);
        }));
        return {client: this.lang_id_to_client.get(lang_id)!, lang_extension};
    }
}
const CODEMIRROR_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CodemirrorCacheEntry {
    view: codemirror.EditorView;
    callbackRef: { fn: (data: Uint8Array) => void };
    ttlTimer: ReturnType<typeof setTimeout> | null;
}

export class CodemirrorInstanceCache {
    private entries = new Map<string, CodemirrorCacheEntry>();

    acquire(filePath: string): CodemirrorCacheEntry | null {
        const entry = this.entries.get(filePath);
        if (!entry) return null;
        if (entry.ttlTimer !== null) {
            clearTimeout(entry.ttlTimer);
            entry.ttlTimer = null;
        }
        return entry;
    }

    store(filePath: string, view: codemirror.EditorView, callbackRef: { fn: (data: Uint8Array) => void }) {
        this.entries.set(filePath, { view, callbackRef, ttlTimer: null });
    }

    release(filePath: string) {
        const entry = this.entries.get(filePath);
        if (!entry) return;
        entry.ttlTimer = setTimeout(() => {
            entry.view.destroy();
            this.entries.delete(filePath);
        }, CODEMIRROR_TTL_MS);
    }

    destroyAll() {
        for (const [, entry] of this.entries) {
            if (entry.ttlTimer !== null) clearTimeout(entry.ttlTimer);
            entry.view.destroy();
        }
        this.entries.clear();
    }
}

type ViewmodeCallback = (request: Request)=>ResourceResponse<any, any>;
export class PageAPI {
    readonly statusBar = new StatusBar();
    readonly codemirrorCache = new CodemirrorInstanceCache();
    rc: ResourceLinkContext;
    rootURL: string;
    languageClients: LanguageClients = new LanguageClients(this);
    async getFromPat(pat: string) {
        return await SrcControlGit.fromPat(await this.fs, pat);
    }
    dialogManager: DialogManager | null = null;
    viewModeMap: Map<string, ViewmodeCallback> = new Map();
    registerViewMode(viewMode: string, callback: ViewmodeCallback): Disposable {
        this.viewModeMap.set(viewMode, callback);
        return {
            dispose: ()=>{
                this.viewModeMap.delete(viewMode);
            }
        }
    }
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

                const fs = await this.fs;
                const asLarge = await fs.readLargeFile(path.resolve(new URL(this.rootURL).pathname, "cryolabs.conf"));
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
            const fs = await this.fs;
            try {
                await fs.createFile(path.resolve(this.rootPath, "cryolabs.conf"));
            } catch {

            }
            
            this._fileconfig = { ...s };
            await fs.writeFile(path.resolve(this.rootPath, "cryolabs.conf"), new TextEncoder().encode(toml.stringify(s as toml.TomlTable)).buffer as ArrayBuffer);

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
    #em = new Emitter<void>();
    onTerminalsUpdated = this.#em.event;
    getTerminal(id: string) {
        return this.#terminals.filter(v => v.id === id)[0];
    }
    addTerminal(id: string, term: PTerminal) {
        this.#terminals.push({
            id, term
        });
        this.#em.emit();
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