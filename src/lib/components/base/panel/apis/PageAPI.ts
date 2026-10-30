import { CodemirrorInstanceCache } from "./CodemirrorInstanceCache";
export { CodemirrorInstanceCache } from "./CodemirrorInstanceCache";
import type { DialogManager, FilePickerOptions } from "$lib/base/dialog/DialogManager";
import { Prefs } from "$lib/base/prefs";
import {languages} from '@codemirror/language-data'
import type { Disposable } from "$lib/base/disposable";
import { Emitter } from "$lib/base/events"
import type { TypedEvent } from "$lib/base/events/events";
import type { ResourceLinkContext } from "$lib/base/resourceCtx";
import type { ExtensionAPI, FSProviderAPI } from "$lib/emulator/types";
import { SrcControlGit } from "$lib/git";
import type { CommandRegistry } from "$lib/base/commands/CommandRegistry.svelte";
import { ConstructExtendablePromise, type ExtendablePromise } from "$lib/utils";
import path from "path-browserify";
import { createContext } from "svelte";
import * as toml from 'smol-toml';
import * as codemirror from 'codemirror';
import * as codemirror_lsp from '@codemirror/lsp-client';
import { autocompletion } from "@codemirror/autocomplete";
import type { ResourceResponse } from "$lib/base/resource";
import type { WM } from "../../windows/WM";
import type { ChangeSet, Text } from "@codemirror/state";
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
class DefaultWorkspaceFile implements codemirror_lsp.WorkspaceFile {
  constructor(readonly uri: string,
              readonly languageId: string,
              public version: number,
              public doc: Text,
              readonly view: codemirror.EditorView) {}

  getView() { return this.view }
}
interface WorkspaceFileUpdate {
  file: codemirror_lsp.WorkspaceFile
  prevDoc: Text
  changes: ChangeSet
}
export class DefaultWorkspace extends codemirror_lsp.Workspace {
  files: DefaultWorkspaceFile[] = []
  private fileVersions: {[uri: string]: number} = Object.create(null)
  page_api: PageAPI | null = null

  nextFileVersion(uri: string) {
    return this.fileVersions[uri] = (this.fileVersions[uri] ?? -1) + 1
  }

  syncFiles() {
    let result: WorkspaceFileUpdate[] = []
    for (let file of this.files) {
      let plugin = codemirror_lsp.LSPPlugin.get(file.view)
      if (!plugin) continue
      let changes = plugin.unsyncedChanges
      if (!changes.empty) {
        result.push({changes, file, prevDoc: file.doc})
        file.doc = file.view.state.doc
        file.version = this.nextFileVersion(file.uri)
        plugin.clear()
      }
    }
    return result
  }

  openFile(uri: string, languageId: string, view: codemirror.EditorView) {
    if (this.getFile(uri))
      throw new Error("Default workspace implementation doesn't support multiple views on the same file")
    let file = new DefaultWorkspaceFile(uri, languageId, this.nextFileVersion(uri), view.state.doc, view) 
    this.files.push(file)
    this.client.didOpen(file)
  }

  closeFile(uri: string) {
    let file = this.getFile(uri)
    if (file) {
      this.files = this.files.filter(f => f != file)
      this.client.didClose(uri)
    }
  }
  async displayFile(uri: string): Promise<codemirror.EditorView | null> {
    if (!this.page_api) return null;
    const fpurl = new URL(uri);
    const filePath = decodeURIComponent(fpurl.pathname);
    const normalizedPath = filePath.startsWith("/root") ? "/user" + filePath.slice(5) : filePath;
    const finalUrl = filePath.startsWith("/root")
      ? "file://" + normalizedPath
      : (()=>{
        let orgUrl = fpurl.href;
        let idxOfColon = orgUrl.indexOf("//");
        return "fs-linux:"+orgUrl.substring(idxOfColon);
      })()
    console.error("Displaying: " + finalUrl);
    this.page_api.openLink(finalUrl, '_blank');
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const cached = this.page_api.codemirrorCache.acquire(normalizedPath);
      if (cached) return cached.view;
      await new Promise(r => setTimeout(r, 50));
    }
    return null;
  }
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
        console.debug("[LSP] Available CodeMirror language definitions:", languages);
        for (let lang of languages){
            
            if (lang.extensions.filter(v=>ename.substring(1).toLowerCase() ===v.toLowerCase()).length > 0) return {lang_id: lang.name.toLowerCase(), lang_extension: await lang.load(), };
        }
        
        return null;
    }
    async registerAllConfigs() {
        const started = await this.page_api.emulatorStarted.promise;
        if (!started) return;
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
        console.debug("[LSP] Loading client for language:", lang_id);
        console.debug("[LSP] Registered language configs:", this.lang_id_to_registration);
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
                    console.debug("[LSP] Sending message to server:", message);
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
                    console.debug("[LSP] Dispatching response from server:", message);
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
            const page_api = this.page_api;
            const lsp_client = new codemirror_lsp.LSPClient({
                extensions: [codemirror_lsp.serverDiagnostics()],
                timeout: 100000,
                workspace: (client) => {
                    const ws = new DefaultWorkspace(client);
                    ws.page_api = page_api;
                    return ws;
                },
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

type ViewmodeCallback = (request: Request)=>ResourceResponse<any, any>;
export type Variants = "dark"|"light"
export interface PageAPIDelegate {
    openWithRootURI(path: string): void;
}

export class DefaultPageAPIDelegate implements PageAPIDelegate {
    openWithRootURI(path: string): void {
        window.open(location.href + "?url='" + path + "'", "_blank");
    }
}
export interface TerminalSettings {
    closeOnExit: boolean;
}
export class PageAPI {
    variant: Variants = "light";
    get trimmedRootPath() {
        let rp = this.rootPath;
        if (rp.startsWith("/root")) {
            return rp.slice(5);
        }
        return rp;
    }
    get globalTerminalSettings(): Promise<TerminalSettings> {
        return Prefs.default()
            .get<TerminalSettings>("terminal.settings", {
                closeOnExit: false 
            }).then(v=>{
                return v!;
            });
    }
    #chTerminalSettingsEmitter: Emitter<TerminalSettings> = new Emitter<TerminalSettings>();
    async setTerminalSettings(newSettings: TerminalSettings): Promise<void> {
        await Prefs.default()
            .store("terminal.settings", newSettings);
        this.#chTerminalSettingsEmitter.emit(newSettings);
    }
    onTerminalSettingsChanged = this.#chTerminalSettingsEmitter.event;
    #globalVarChangedEmitter = new Emitter<string>();
    onGlobalVariantChanged: TypedEvent<string> = this.#globalVarChangedEmitter.event;
    setGlobalVariant(nwVariant: typeof this.variant) {
        this.variant = nwVariant;
        this.#globalVarChangedEmitter.emit(nwVariant);
    }
    windows: WM|null = null;
    isEditorReadonly = false;
    emulatorStarted: ExtendablePromise<boolean> = ConstructExtendablePromise<boolean>();
    readonly statusBar = new StatusBar();
    readonly codemirrorCache = new CodemirrorInstanceCache();
    rc: ResourceLinkContext;
    rootURL: string;
    languageClients: LanguageClients = new LanguageClients(this);
    async getFromPat(pat: string) {
        return await SrcControlGit.fromPat(await this.fs, pat);
    }
    delegate: PageAPIDelegate = new DefaultPageAPIDelegate();
    dialogManager: DialogManager | null = null;
    commandRegistry: CommandRegistry | null = null;
    viewModeMap: Map<string, ViewmodeCallback> = new Map();
    fsExtensionMap: [RegExp, ViewmodeCallback][] = [];
    addFSExtension(fsExtension: [RegExp, ViewmodeCallback]) {
        this.fsExtensionMap.push(fsExtension);
    }
    registerViewMode(viewMode: string, callback: ViewmodeCallback): Disposable {
        this.viewModeMap.set(viewMode, callback);
        return {
            dispose: ()=>{
                this.viewModeMap.delete(viewMode);
            }
        }
    }
    constructor(rc: ResourceLinkContext, rootURL = "file:///", dialogManager: DialogManager | null = null, isReadonly = false) {
        this.rc = rc;
        this.isEditorReadonly = isReadonly;
        this.rootURL = rootURL;
        this.dialogManager = dialogManager;
        this.repoChangeEmitter.event(({ owner, repo }) => {
            this.fileconfig.then(fc => {
                fc.github_link = { ...fc.github_link, owner, repo };
                this.setFileConfig(fc);
            });
        });
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
                const asLarge = await fs.readLargeFile(path.join(new URL(this.rootURL).pathname, "cryolabs.conf"));
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
                await fs.createFile(path.join(this.rootPath, "cryolabs.conf"));
            } catch {

            }
            
            this._fileconfig = { ...s };
            let bu =new TextEncoder().encode(toml.stringify(s as toml.TomlTable)).buffer as ArrayBuffer;
            await fs.writeFile(path.join(this.rootPath, "cryolabs.conf"), bu);
            await fs.truncate(path.join(this.rootPath, "cryolabs.conf"), bu.byteLength);
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
    readonly repoChangeEmitter = new Emitter<{ owner: string; repo: string }>();
    async getGitManager(): Promise<SrcControlGit | null> {
        const dm = this.dialogManager;
        if (!dm) return null;

        while (true) {
            let token = await Prefs.default().get<string | undefined>('git.personal_access', undefined);

            if (!token) {
                token = (await dm.showPrompt({
                    title: 'Enter personal access token',
                    message: 'You will need to enter your personal access token. Use <a href="https://github.com/settings/tokens/new" target="_blank">this link</a>',
                    validation: (value) => value.startsWith('ghp_'),
                    required: true,
                })) ?? undefined;

                if (!token) return null;
                await Prefs.default().store('git.personal_access', token);
            }

            const git = await this.getFromPat(token);
            if (!git) {
                await Prefs.default().store('git.personal_access', null);
                continue;
            }
            git.owner = await this.fileconfig.then(fc => fc.github_link?.owner ?? null);
            git.repo = await this.fileconfig.then(fc => fc.github_link?.repo ?? null);
            git.repoChangeEmitter = this.repoChangeEmitter;
            return git;
        }
    }
    showFilePicker(options: FilePickerOptions): Promise<string | null> {
        if (!this.dialogManager) return Promise.resolve(null);
        return this.dialogManager.showFilePicker(options);
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

    private _watcherIdPromise: Promise<string> | null = null;
    get watcherId(): Promise<string> {
        if (!this._watcherIdPromise) {
            this._watcherIdPromise = (async () => {
                const id = crypto.randomUUID();
                const fsp = await this.fs;
                await fsp.assignId(id);
                return id;
            })();
        }
        return this._watcherIdPromise;
    }

}
export const [usePageAPI, setPageAPI] = createContext<PageAPI>();