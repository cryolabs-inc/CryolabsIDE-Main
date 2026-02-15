/// <reference lib="WebWorker" />
console.info("[INFO] initializing emulator Web Worker");
import * as localforage from "localforage";
import * as msgpack from '@msgpack/msgpack';
declare const self: DedicatedWorkerGlobalScope;
Object.defineProperty(globalThis, 'process', { value: undefined });

import * as comlink from 'comlink';
import { ConnectionClient } from './connection_clientv2.mts'
import { Emitter } from "$lib/base/events";
import { fs, fsP, saveIndex, webfs } from "$lib/base/fs";
import type { ConnectParams, ExtensionAPI, FSDirent, FSProviderAPI, ShellAPI } from "./types";
import px from "path";
import { Errno, withErrno } from "kerium";
import { getHandler } from "$lib/base/fs/p9handler";
import type { Disposable } from "$lib/base/disposable";
import type { FSChange } from "$lib/base/fs/changes";
import { O_CREAT, O_EXCL, O_RDWR, O_TRUNC } from "@zenfs/core/constants.js";
let basePath = "/";
let vm_instance = ConstructExtendablePromise<any>();

function getWriteTo(num: number) {
    return 'virtio-console' + num + "-input-bytes";
}
function getReadFrom(num: number) {
    return 'virtio-console' + num + "-output-bytes";
}

let Extendable = ConstructExtendablePromise<void>();

let queryParameters = new URLSearchParams(location.search);
function getSrvRoot() {

    return new URL(basePath, location.href).href;
}
function receiveMsgpackMessage(emulator: any, cid: number, onMessage: (msg: Uint8Array) => void, onClose: () => void) {


}
let globChEmitter = new Emitter<FSChange>();
let connection: ExtendablePromise<ConnectionClient> = ConstructExtendablePromise();
interface ExtendablePromise<T> {
    promise: Promise<T>;
    Resolve(value: T): void;
}
function ConstructExtendablePromise<T>() {
    let R: (val: T) => void = (va) => { };
    let prom = new Promise((resolve => {
        R = resolve;
    }));
    return { promise: prom, Resolve: R } as ExtendablePromise<T>;
}
let progressGroup: MessagePort[] = [];
class FSProviderInternalImpl implements FSProviderAPI {
    fs9p: any;
    assignedId?: string;
    async renameEntry(oldPath: string, newPath: string): Promise<void> {
        let newParent = px.dirname(newPath);
        let oldParent = px.dirname(oldPath);
        await fsP.rename(oldPath, newPath);
        await this.emitGlobal(newParent, "rename", true);
        await this.emitGlobal(oldParent, "rename", true);
    }
    async watchForRefresh(refreshCb: (fsChange: FSChange) => void): Promise<Disposable> {
        let d = globChEmitter.event(refreshCb);
        return comlink.proxy({
            dispose() {
                d.dispose();
            }
        });

    }
    async disposeWatcher() {

    }
    private normalizeLockPath(targetPath: string): string {
        // Normalize path for consistent locking (remove trailing slashes, resolve ..)
        return targetPath.replace(/\/+$/, '') || '/';
    }

    async withLock<T>(targetPath: string, func: (...args: any[]) => T): Promise<T> {
        const lockName = `fs-lock:${this.normalizeLockPath(targetPath)}`;
        return navigator.locks.request(lockName, async (_) => {
            return await func();
        });
    }

    constructor(fsOpfs: any) {
        this.fs9p = fsOpfs;
    }
    readdir(path: string): Promise<string[]> {
        return this.readDirectory(path);
    }

    async readFile(path: string, length?: number, position?: number): Promise<Uint8Array> {
        return this.withLock(path, async () => {
            let st = await fsP.stat(path);
            if (st.isDirectory()) {
                throw Errno.EISDIR;
            }
            let result = new Uint8Array(length ?? st.size);

            let fh = await fsP.open(path, fsP.constants.O_RDWR);
            let r = await fh.read(result, 0, result.length, position);
            await fh.close();
            return r.buffer.subarray(0, r.bytesRead);
        });
    }
    async assignId(id: string) {
        this.assignedId = id;
    }
    id() {
        return this.assignedId;
    }
    async emitGlobal(path: string, method: string, isEntryChange: boolean = false) {
        saveIndex();
        globChEmitter.emit({ path, method, isEntryChange, srcId: this.assignedId });
    }
    async writeFile(path: string, data: ArrayBuffer, length: number, position: number, openMode = fsP.constants.O_TRUNC): Promise<number> {
        let isNewEntry = false;
        try {
            await fsP.stat(path);
        } catch {
            isNewEntry = true;
        }
        return this.withLock(path, async () => {
            length ??= data.byteLength;
            position ??= 0;
            let fh = await fsP.open(path, fsP.constants.O_RDWR | fsP.constants.O_CREAT | openMode);

            let { bytesWritten } = await fh.write(new Uint8Array(data), { length, position });
            await fh.close();
            this.emitGlobal(path, "write", isNewEntry);

            return bytesWritten;
        });
    }

    async readLargeFile(p: string): Promise<File> {
        return this.withLock(p, async () => {
            try {
                return await (await webfs.get("file", p)).getFile()
            } catch (E) {
                console.error("failed to retr file.");
                throw E;
            }
        });
    }

    async stat(path: string): Promise<fs.Stats> {
        return this.withLock(path, async () => await fsP.stat(path));
    }

    async createDirectory(path: string): Promise<void> {
        this.emitGlobal(path, "createdir", true);
        return this.withLock(path, async () => await fsP.mkdir(path));
    }
    async createFile(path: string): Promise<void> {
        return this.withLock(path, async () => {

            let fh = await fsP.open(path, O_CREAT | O_EXCL | O_RDWR);
            await fh.writeFile(new Uint8Array(0));
            await fh.close();
            this.emitGlobal(px.dirname(path), "createFile", true);
        })
    }
    async readDirectory(path: string): Promise<string[]> {
        return this.withLock(path, async () => await fsP.readdir(path));
    }

    async ls(path: string): Promise<FSDirent[]> {

        return this.withLock(path, async () => {
            let od = await fsP.opendir(path);
            let fsd = [] as FSDirent[];
            for await (let op of od) {
                fsd.push({
                    dt_type: op.type,
                    ino: op.ino,
                    name: op.name
                });
            }
            await od.close();
            return fsd;
        });
    }

    async removeEntry(path: string): Promise<void> {


        return this.withLock(path, async () => {
            await fsP.rm(path);
            this.emitGlobal(px.dirname(path), "removed", true);
        });
    }

    async removeDirectory(path: string, opts: { recursive: boolean } = { recursive: false }): Promise<void> {


        return this.withLock(path, async () => {
            await fsP.rm(path, {
                recursive: opts.recursive
            })
            this.emitGlobal(px.dirname(path), "removed", true);
        });
    }
    async mkdir(path: string, opts: { recursive: boolean; } = { recursive: false }): Promise<void> {
        return this.withLock(path, async () => {
            this.emitGlobal(px.dirname(path), "mkdir", true);
            await fsP.mkdir(path, opts);
        })
    }
    async truncate(path: string, nwSize: number): Promise<void> {
        return this.withLock(path, async () => {
            await fsP.truncate(path, nwSize);
            await this.emitGlobal(path, "trunc", true);
        })
    }
}
function downloadV86(getSrvRoot: () => string) {

    return import(/* @vite-ignore */(getSrvRoot() + 'libv86.mjs'));
}

class Connection implements Connection {
    fileSystemPort: MessagePort;
    serialConsolePort: MessagePort;
    fsImpl: FSProviderInternalImpl;
    constructor(vm_instance: any, fileSystemPort: MessagePort, serialConsolePort: MessagePort, extensionPort: MessagePort) {
        this.fileSystemPort = fileSystemPort; this.serialConsolePort = serialConsolePort;
        this.fsImpl = new FSProviderInternalImpl(vm_instance.fs9p);
        serialConsolePort.start();
        vm_instance.add_listener("serial0-output-byte", (dat: number) => {
            serialConsolePort.postMessage({
                type: "terminalData",
                data: String.fromCharCode(dat)
            });
        });
        serialConsolePort.onmessage = (e) => {
            vm_instance.serial0_send(e.data.data);
        };
        comlink.expose(this.fsImpl, fileSystemPort);

    }

}

interface WorkerHandlerAPI {

    connect(param: ConnectParams): Promise<Connection>;
}
class WorkerHandler implements WorkerHandlerAPI {
    // cid: number = 0;
    constructor() {
        // this.cid = 0;
    }
    async connect(param: ConnectParams) {
        progressGroup.push(param.serialConsolePort);
        let vmi = await vm_instance.promise;

        let e: ExtensionAPI = {
            async onReadyCallback(callback) {
                Extendable.promise.then(() => {
                    callback();
                });

            },
            async update(progressCallback: (total: number, loaded: number) => void) {
                await localforage.removeItem("disk_downloaded");
            },
            async openPtyToShell(cmd: string, args: string[]) {
                let conn = await connection.promise;

                let proc = await conn.start_process_pty(cmd, args);
                
                let ts = new TransformStream<Uint8Array,Uint8Array>();
                return comlink.proxy({
                    
                    kill: async ()=>{
                        return proc.kill();
                    },
                    wait: async()=>{
                        return proc.wait();
                    },
                    streams: async()=>{
                        return comlink.transfer({
                            writable: proc.pty_stream_writer,
                    readable: proc.pty_stream_reader,
                        }, [proc.pty_stream_reader, proc.pty_stream_writer]);
                    }
                });
            }
        };
        comlink.expose(e, param.extensionApi);
        return comlink.proxy(new Connection(vmi, param.fileSystemPort, param.serialConsolePort, param.extensionApi as MessagePort));
    }
}
let workerHandler = new WorkerHandler();
self.onmessage = (e) => {
    let port = e.ports[0];
    comlink.expose(workerHandler, port);
    port.start();
    if (e.data.start) {
        let gsrvroot = () => (e.data.basePath as string) ?? getSrvRoot()
        workerCode(gsrvroot);
    }
};

async function workerCode(getSrvRoot: () => string) {
    let v86 = await downloadV86(getSrvRoot);
    let disk_storage = await localforage.getItem("disk_downloaded") as ArrayBuffer | undefined;
    if (!disk_storage) {

        console.log("Downloading disk image");
        try {
            let r = await fetch(getSrvRoot() + 'disk');
            if (!r.ok) {
                throw new Error("Failed to download disk image.");
            }
            let diskBuffer = new ArrayBuffer(parseInt(r.headers.get("Content-Length") ?? "536870912"));
            let bytes = new Uint8Array(diskBuffer);
            let b = r.body;
            if (!b) {
                throw new Error("Could not retreive response body");
            }
            let reader = b.getReader();
            let off = 0;
            function onProgress(total: number, loaded: number) {
                progressGroup.forEach(evt => {
                    evt.postMessage({
                        type: "progress",
                        total,
                        loaded
                    });
                });
            }
            while (true) {
                let ch = await reader.read();
                if (ch.done) {
                    //value is null
                    break;
                }
                bytes.set(ch.value, off);
                onProgress(diskBuffer.byteLength, off);

                off += ch.value.length;
            }

            disk_storage = diskBuffer;
            try {
                await localforage.setItem("disk_downloaded", diskBuffer);
            } catch { };
        } catch (e) {
            if (e instanceof Error) {
                console.error(e.message);
            } else {
                throw e;
            }
        }
    }

    setTimeout(() => {
        progressGroup.forEach((v) => {
            v.postMessage({
                type: "downloadDone"

            });
        });
        progressGroup = [];

    }, 1000);
    let uri = new URL(getSrvRoot(), location.origin);
    uri.protocol = "http:";
    let initArgs = [uri.href, "sdjfksjf"];
    let initArgsB64 = initArgs.map(v => btoa(v));
    let final = initArgsB64.join(" ");
    let hda = disk_storage && {
        buffer: disk_storage,
        size: disk_storage.byteLength
    };

    let v86_startupoptions = {
        bios: {
            url: getSrvRoot() + "seabios.bin"
        },
        vga_bios: {
            url: getSrvRoot() + "vgabios.bin",
        },
        bzimage: {
            url: getSrvRoot() + "bzImage",
            size: 7647744,
        },
        // },
        hda,
        cmdline: `console=ttyS0 root=/dev/sda init=/sbin/init rw`,
        wasm_path: `${getSrvRoot()}v86.wasm`,
        memory_size: 1024 * 1024 * 1024 * 2,
        disable_keyboard: true,
        disable_mouse: true,
        virtio_console: true,
        autostart: true,
        "filesystem": {
            handle9p: getHandler(globChEmitter)
        },
        net_device: {
            type: "virtio",
            relay_url: "fetch",
            fetch: async (url: string, opts: any) => {
                if (url.includes('registry.npmjs.org')) {
                    console.warn("[WARN] removing registry.npmjs.org headers]");

                    delete opts.headers;
                    opts = undefined;
                }
                return await fetch(url, opts);
            }
        }
    };
    let initinstance = new v86.V86(v86_startupoptions);
    Object.defineProperty(self, 'emulator', { value: initinstance, configurable: true, writable: true });
    // Object.defineProperty(self, 'msgLoop', {value: new MessageLoop(), configurable: true, writable: true});
    initinstance.add_listener("emulator-ready", () => {
        vm_instance.Resolve(initinstance);
        initinstance.add_listener(getReadFrom(1), function _ref() {
            let rs = new ReadableStream<Uint8Array>({
                start(controller) {
                    initinstance.add_listener(getReadFrom(0), (dat: Uint8Array) => {
                        controller.enqueue(dat);
                    })
                }
            });
            let ws = new WritableStream<Uint8Array>({
                write(chunk, controller) {
                    initinstance.bus.send(getWriteTo(0), chunk);
                }
            });
            connection.Resolve(new ConnectionClient(rs, ws));
            initinstance.remove_listener(getReadFrom(1), _ref);
        })
    });

}

// export type {WorkerHandlerAPI};
self.postMessage({ msg: "ready" });
