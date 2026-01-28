/// <reference lib="WebWorker" />
console.info("[INFO] initializing emulator Web Worker");
import * as localforage from "localforage";
import * as msgpack from '@msgpack/msgpack';
declare const self: DedicatedWorkerGlobalScope;
Object.defineProperty(globalThis, 'process', { value: undefined });

import * as comlink from 'comlink';

import { Emitter } from "$lib/base/events";
import { fs, fsP } from "$lib/base/fs";
import type { ConnectParams, ExtensionAPI, FSDirent, FSProviderAPI, ShellAPI } from "./types";
import path from "path";
import { Errno, withErrno } from "kerium";
import { getHandler } from "$lib/base/fs/p9handler";
let basePath = "/";
let vm_instance = ConstructExtendablePromise<any>();

function getWriteTo(num: number) {
    return 'virtio-console' + num + "-input-bytes";
}
function getReadFrom(num: number) {
    return 'virtio-console' + num + "-output-bytes";
}

let msgHandler: ExtendablePromise<ReturnType<typeof attachMessageHandler>> = ConstructExtendablePromise();
let Extendable = ConstructExtendablePromise<void>();
function attachMessageHandler(emulator: any) {
    emulator.add_listener(getReadFrom(0), (e: Uint8Array) => {
        if (new TextDecoder().decode(e).includes("ready")) {
            Extendable.Resolve();
        }
    });
    let messages: { cid: number, msg: any }[] = [];
    let draining = false;

    async function drainer() {
        await Extendable.promise;
        if (draining) return;
        draining = true;

        while (messages.length > 0) {
            const msg = messages.shift();
            if (!msg) continue;
            await sendMsgpackMessage(emulator, msg.cid, msg.msg);
        }

        draining = false;
    }

    function scheduleDrain(cid: number, msg: any) {
        messages.push({ cid, msg });
        drainer(); // triggers if not already draining
    }

    async function sendMsgpackMessage(emulator: any, cid: number, msg: any) {
        const ua = msgpack.encode(msg);
        const finalPkt = new Uint8Array(5 * 4 + ua.length);
        const u32 = new Uint32Array(finalPkt.buffer, 0, 5);
        u32.set([finalPkt.length, 1, 0, cid, 6]);
        finalPkt.set(ua, 20);

        for (let i = 0; i < finalPkt.length; i += 64) {
            emulator.bus.send(getWriteTo(1), finalPkt.subarray(i, i + 64));
            await new Promise(r => setTimeout(r, 3)); // reduced delay for responsiveness
        }
    }

    const et = emulator.et = new EventTarget();
    let bua = new Uint8Array(0);

    function drainMsg(): boolean {
        if (bua.length < 20) return false;

        const view = new DataView(bua.buffer, bua.byteOffset, bua.byteLength);
        const totalLen = view.getUint32(0, true);
        const magic = view.getUint32(8, true);
        const packetCid = view.getUint32(12, true);

        if (bua.length < totalLen) return false;

        const fullMsg = bua.slice(0, totalLen);
        et.dispatchEvent(new CustomEvent(`conn-${packetCid}-output`, { detail: fullMsg }));
        bua = bua.slice(totalLen); // advance buffer
        return true;
    }

    emulator.add_listener(getReadFrom(2), function on(dat: Uint8Array) {
        const view = new DataView(dat.buffer, dat.byteOffset, dat.byteLength);
        const magic = view.getUint32(8, true);
        const packetCid = view.getUint32(12, true);

        if (magic === 0xDEAD) {
            et.dispatchEvent(new CustomEvent(`conn-${packetCid}-close`));
            // emulator.remove_listener(getReadFrom(2), on);
            return;
        }

        // Append to buffer (avoid copying if possible)
        const combined = new Uint8Array(bua.length + dat.length);
        combined.set(bua, 0);
        combined.set(dat, bua.length);
        bua = combined;

        // Drain all full messages
        while (drainMsg());
    });

    function recieveForCid(cid: number, dataCb: (dat: Uint8Array) => void, closeCb: () => void) {
        et.addEventListener(`conn-${cid}-output`, (a) => {
            const evt = a as CustomEvent<Uint8Array>;
            dataCb(evt.detail);
        });
        et.addEventListener(`conn-${cid}-close`, () => {
            closeCb();
        });
    }

    function sendForCid(cid: number, msg: any) {
        scheduleDrain(cid, msg);
    }

    return {
        recieveForCid,
        sendForCid
    };
}
function getSrvRoot() {

    return new URL(basePath, location.href).href;
}
function receiveMsgpackMessage(emulator: any, cid: number, onMessage: (msg: Uint8Array) => void, onClose: () => void) {


}
class MessageLoop {
    emulator: any;
    // buffers: [];
    // totalSize: number;
    // rx_addr: number;
    static _instance: MessageLoop;
    static ready: ExtendablePromise<void> = ConstructExtendablePromise<void>();
    static add_data_listener: () => void;
    // saveHere: EventTarget;
    static saveHere: EventTarget;
    static run_program: (emulator: any, cmd: string, outputStd: (data: string) => void, outputErr: (data: string) => void) => { input: (data: string) => void, wait: () => Promise<number>, kill: (signal: number) => Promise<void> };
    async run_program(emulator: any, cmd: string, outputStd: (data: string) => void, outputErr: (data: string) => void) {
        let conn = this.connect();
        let waiter = ConstructExtendablePromise<number>();
        conn.pktListener.addEventListener("incomingPkt", (event) => {
            let incomingPacket = event as CustomEvent<Uint8Array>;
            try {
                if (new TextDecoder().decode(incomingPacket.detail).includes('\x1F')) {
                    waiter.Resolve(parseInt(new TextDecoder().decode(new Uint8Array(incomingPacket.detail.subarray(1)))));

                    return;
                }
                outputStd(new TextDecoder().decode(incomingPacket.detail));
            } catch { };
        });
        await conn.send("echo hi\n");
        return {
            async input(data: string) {
                return conn.send(data);
            },
            wait() {
                return waiter;
            },
            async kill(signal: number) {
                conn.disconnect();
            }
        };
    }
    static get instance() {
        this.saveHere ??= new EventTarget();
        this._instance ??= new MessageLoop(this.saveHere);

        return this._instance;

    }
    static addSaveHandler(handler: EventListenerOrEventListenerObject) {

        this.saveHere.addEventListener('savenow', handler);
    }
    static virtio_console_bus: (emulator: any) => void = () => { };
    static onEmulatorLoaded(emulator: any) {

    }
    buffer = {
        ua: new Uint8Array(),
        total_len: 0
    };
    async connect_msgpack(emulator: any = this.emulator, payload: string, onData: (dat: Uint8Array) => void, onClose: () => void) {
        let evtTarget = new Emitter<Uint8Array>();
        let mh = await msgHandler.promise;

        let cid = this.cid++;

        mh.sendForCid(cid, {
            "type": "launchPTY",
            "payload": payload
        });

        mh.recieveForCid(cid, (dat: Uint8Array) => {
            let ad = dat.subarray(20);
            let d = (msgpack.decode(ad) as { payload: Uint8Array }).payload;
            evtTarget.emit(d)
            onData(d);
        }, onClose);

        return {
            pktListener: evtTarget.event,
            cid,
            async disconnect() {
                mh.sendForCid(cid, {
                    "type": "kill",
                    payload: cid,
                });
            },
            async send(msg: Uint8Array) {
                mh.sendForCid(cid, {
                    type: "input",
                    payload: msg
                });
            }
        };
    }
    cid: number = 0;
    connect(emulator: any = this.emulator) {
        let cid = this.cid++;

        function internalConnect(cid: number) {
            emulator.bus.send('virtio-console1-input-bytes', new Uint8Array(new Uint32Array([20, 1, 0, cid, 2]).buffer));
        }
        let evtTarget = new EventTarget();
        internalConnect(cid);
        emulator.add_listener(getReadFrom(2), (ua: Uint8Array) => {
            //             typedef struct IPCMessage {
            //   int msg_len_total;
            //   int msg_id, theError;
            //   int cid; // -1 for a new connection, nonnegative if we are requesting for a
            //            // connection id to be used
            //   enum MsgType type;
            //   char request[];
            // } IPCMessage;
            let header = new Uint32Array(ua.buffer.slice(0, 20));

            let c = header[3];
            if (c !== cid) {
                return;
            }
            let theRealPkt = new Uint8Array(ua.buffer.slice(24));

            evtTarget.dispatchEvent(new CustomEvent("incomingPkt", { detail: theRealPkt }));
            // typedef struct NewConnectionMessageProcess {

            // } NewConnectionMessageProcess; // only lanches /bin/sh anyways
            // typedef struct NewConnectionMessageIPV4 {
            //   enum ConnectionType type;
            //   int32_t hostname;
            //   int32_t port;
            // } NewConnectionMessage;

            // typedef struct DisconnectMessageIPV4 {
            // } DisconnectMessageIPV4;

            // typedef struct PktFrame {
            //   size_t msgLen;
            //   char dat[]; // the length comes from the total message len
            // } PktFrame;
            // static int epoll_fd = -1;
            // enum STATUS { OK = 0, MORE = 1, ERROR = 2 };

        });
        return {
            pktListener: evtTarget,
            cid: cid,
            disconnect() {
                emulator.bus.send('virtio-console1-input-bytes', new Uint8Array(new Uint32Array([20, 1, 0, cid, 5]).buffer));
            },
            /**
             * 
             * You must await the promise. If you don't, you risk dropped packages and undefined behaviour
             */
            async send(data: string | Uint8Array): Promise<void> {
                let buffer = data;
                if (typeof buffer === "string") {
                    buffer = new TextEncoder().encode(buffer);
                }

                let ba = buffer as Uint8Array;
                let connectionPkt = [20, 1, 0, cid, 3, ba.length];
                let header = new Uint8Array(new Uint32Array(connectionPkt).buffer);
                let fullPkt = new Uint8Array(header.length + ba.length);
                fullPkt.set(header, 0);
                fullPkt.set(ba, header.length);
                new DataView(fullPkt.buffer).setUint32(0, fullPkt.length, true);
                emulator.bus.send('virtio-console1-input-bytes', fullPkt);
                await new Promise(r => setTimeout(r, 500));
            }
        };
    }

    constructor(saveHereTarget?: EventTarget) {

    }


}
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
let msgLoop: ExtendablePromise<MessageLoop> = ConstructExtendablePromise();
class FSProviderInternalImpl implements FSProviderAPI {
    fs9p: any;

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

    async writeFile(path: string, data: Uint8Array, length: number, position: number): Promise<number> {
        return this.withLock(path, async () => {
            length ??= data.length;
            position ??= 0;
            let fh = await fsP.open(path, fsP.constants.O_RDWR | fsP.constants.O_CREAT);
            let { bytesWritten } = await fh.write(data, { length, position });
            await fh.close();
            return bytesWritten;
        });
    }

    async readLargeFile(p: string): Promise<File> {
        return this.withLock(p, async () => {
            let dat = await fsP.readFile(p) as Uint8Array<ArrayBuffer>;
            let st = await fsP.stat(p);
            return new File([dat], path.basename(p), { lastModified: st.mtimeMs });
        });
    }

    async stat(path: string): Promise<fs.Stats> {
        return this.withLock(path, async () => await fsP.stat(path));
    }

    async createDirectory(path: string): Promise<void> {
        return this.withLock(path, async () => await fsP.mkdir(path));
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
        });
    }

    async removeDirectory(path: string): Promise<void> {
        return this.withLock(path, async () => { await fsP.rmdir(path) });
    }

}
function downloadV86() {

    return import(/* vite-treat-as-asset */ getSrvRoot() + 'libv86.mjs');
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

        console.log("Hi");
        let e: ExtensionAPI = {
            async onReadyCallback(callback) {
                Extendable.promise.then(() => {
                    callback();
                });

            },
            async update(progressCallback: (total: number, loaded: number) => void) {
                await localforage.removeItem("disk_downloaded");
            },
            async openPtyToShell(cmd: string, callback: (dat: Uint8Array) => void, closeCallback: () => void) {
                let ml = await msgLoop.promise;
                let session = await ml.connect_msgpack(vmi, cmd, callback, closeCallback);
                return comlink.proxy({
                    async send(data: Uint8Array<ArrayBufferLike>) {
                        session.send(data);
                    },
                    async pull() {
                        return new Promise<Uint8Array>((resolve) => {
                            let evtDisposed = session.pktListener((dat) => {
                                resolve(dat);
                                evtDisposed.dispose();
                            })
                        });
                    },
                    async close() {
                        session.disconnect();
                    }
                } as ShellAPI);
            }
        };
        comlink.expose(e, param.extensionApi);
        return comlink.proxy(new Connection(vmi, param.fileSystemPort, param.serialConsolePort, param.extensionApi as MessagePort));
    }
}
let workerHandler = new WorkerHandler();
self.onmessage = (e) => {
    console.log("exposed");
    let port = e.ports[0];
    comlink.expose(workerHandler, port);
    port.start();
};

async function workerCode() {
    let v86 = await downloadV86();
    let disk_storage = await localforage.getItem("disk_downloaded") as ArrayBuffer | undefined;
    if (!disk_storage) {


        try {
            let r = await fetch(getSrvRoot() + 'disk');
            if (!r.ok) {
                throw new Error("Failed to download disk image.");
            }
            let diskBuffer = new ArrayBuffer(parseInt(r.headers.get("Content-Length") ?? "313774080"));
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
        buffer: disk_storage
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
            handle9p: getHandler()
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
        msgHandler.Resolve(attachMessageHandler(initinstance));
        msgLoop.Resolve(new MessageLoop());
    });

}

workerCode();
// export type {WorkerHandlerAPI};
self.postMessage({ msg: "ready" });