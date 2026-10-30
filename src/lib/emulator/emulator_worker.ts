/// <reference lib="WebWorker" />
console.debug("[Worker] Emulator web worker initializing...");
import * as localforage from "localforage";
import * as msgpack from "@msgpack/msgpack";
declare const self: DedicatedWorkerGlobalScope;
Object.defineProperty(globalThis, "process", { value: undefined });

import * as comlink from "comlink";
import { ConnectionClient } from "./connection_clientv2.mts";
import { Emitter } from "$lib/base/events";
import { fs, fsP, webfs } from "$lib/base/fs";
import type {
  ConnectParams,
  ExtensionAPI,
  FSDirent,
  FSProviderAPI,
} from "./types";
import px from "path-browserify";
import { getHandler } from "$lib/base/fs/p9handler";
import type { Disposable } from "$lib/base/disposable";
import type { FSChange } from "$lib/base/fs/changes";
import { FileSystemRouter } from "$lib/base/fs/router";
const basePath = "/";
const vm_instance = ConstructExtendablePromise<any>();

function getWriteTo(num: number) {
  return "virtio-console" + num + "-input-bytes";
}
function getReadFrom(num: number) {
  return "virtio-console" + num + "-output-bytes";
}

const Extendable = ConstructExtendablePromise<void>();

const queryParameters = new URLSearchParams(location.search);
function getSrvRoot() {
  return new URL(basePath, location.href).href;
}
function receiveMsgpackMessage(
  emulator: any,
  cid: number,
  onMessage: (msg: Uint8Array) => void,
  onClose: () => void,
) {}
const globChEmitter = new Emitter<FSChange>();
const fsRouter = new FileSystemRouter(globChEmitter);
const connection: ExtendablePromise<ConnectionClient> =
  ConstructExtendablePromise();
interface ExtendablePromise<T> {
  promise: Promise<T>;
  Resolve(value: T): void;
}
function ConstructExtendablePromise<T>() {
  let R: (val: T) => void = (va) => {};
  const prom = new Promise((resolve) => {
    R = resolve;
  });
  return { promise: prom, Resolve: R } as ExtendablePromise<T>;
}
let progressGroup: MessagePort[] = [];
class FSProviderInternalImpl implements FSProviderAPI {
  assignedId?: string;

  private route<T>(operation: () => Promise<T>): Promise<T> {
    return fsRouter.run(operation, this.assignedId);
  }

  async assignId(id: string) {
    this.assignedId = id;
  }
  id() {
    return this.assignedId;
  }
  async watchForRefresh(refreshCb: (fsChange: FSChange) => void): Promise<Disposable> {
    const watcher = globChEmitter.event(refreshCb);
    return comlink.proxy({ dispose: () => watcher.dispose() });
  }
  async disposeWatcher() {}

  renameEntry(oldPath: string, newPath: string): Promise<void> {
    return this.route(() => fsRouter.rename(oldPath, newPath));
  }
  readFile(path: string, length?: number, position?: number): Promise<Uint8Array> {
    return this.route(() => fsRouter.readFile(path, length, position));
  }
  writeFile(path: string, data: ArrayBuffer, length?: number, position?: number, openMode?: number): Promise<number> {
    return this.route(() => fsRouter.writeFile(path, data, length, position, openMode));
  }
  readLargeFile(path: string): Promise<File> {
    return this.route(() => fsRouter.readLargeFile(path));
  }
  stat(path: string): Promise<fs.Stats> {
    return this.route(() => fsRouter.stat(path));
  }
  createDirectory(path: string): Promise<void> {
    return this.mkdir(path);
  }
  createFile(path: string): Promise<void> {
    return this.route(() => fsRouter.createFile(path));
  }
  readdir(path: string): Promise<string[]> {
    return this.route(() => fsRouter.readdir(path));
  }
  readDirectory(path: string): Promise<string[]> {
    return this.readdir(path);
  }
  ls(path: string): Promise<FSDirent[]> {
    return this.route(() => fsRouter.ls(path));
  }
  removeEntry(path: string): Promise<void> {
    return this.route(() => fsRouter.remove(path));
  }
  removeDirectory(path: string, opts = { recursive: false }): Promise<void> {
    return this.route(() => fsRouter.remove(path, opts));
  }
  mkdir(path: string, opts = { recursive: false }): Promise<void> {
    return this.route(() => fsRouter.mkdir(path, opts));
  }
  truncate(path: string, size: number): Promise<void> {
    return this.route(() => fsRouter.truncate(path, size));
  }
}

function downloadV86(getSrvRoot: () => string) {
  return import(/* @vite-ignore */ getSrvRoot() + "libv86.mjs");
}

class Connection implements Connection {
  fileSystemPort: MessagePort;
  serialConsolePort: MessagePort;
  fsImpl: FSProviderInternalImpl;

  constructor(
    vm_instance: any,
    fileSystemPort: MessagePort,
    serialConsolePort: MessagePort,
    extensionPort: MessagePort,
  ) {
    this.fileSystemPort = fileSystemPort;
    this.serialConsolePort = serialConsolePort;
    this.fsImpl = new FSProviderInternalImpl();
    comlink.expose(this.fsImpl, fileSystemPort);

    if (!vm_instance) {
      return;
    }
    serialConsolePort.start();
    vm_instance.add_listener("serial0-output-byte", (dat: number) => {
      serialConsolePort.postMessage({
        type: "terminalData",
        data: String.fromCharCode(dat),
      });
    });
    serialConsolePort.onmessage = (e) => {
      vm_instance.serial0_send(e.data.data);
    };
  }
}

interface WorkerHandlerAPI {
  connect(param: ConnectParams): Promise<Connection>;
}

class WorkerHandler implements WorkerHandlerAPI {
  // cid: number = 0;
  disk_version: ExtendablePromise<string> = ConstructExtendablePromise<string>();
  constructor() {
    // this.cid = 0;
  }
  async connect(param: ConnectParams) {
    progressGroup.push(param.serialConsolePort);
    console.debug(
      "[Worker] Serial port registered, waiting for VM instance...",
    );

    const vmi = await vm_instance.promise;
    console.debug("[Worker] VM instance ready, exposing extension API...");
    const thiz = this;
    const e: ExtensionAPI = {
      async onReadyCallback(callback) {
        Extendable.promise.then(() => {
          callback();
        });
      },
      async update(progressCallback: (total: number, loaded: number) => void) {
        let disk_version_str = await thiz.disk_version.promise;
        await localforage.removeItem("disk_downloaded-"+disk_version_str);
      },
      async openPtyToShell(cmd: string, args: string[]) {
        const conn = await connection.promise;

        const proc = await conn.start_process_pty(cmd, args);

        return comlink.proxy({
          kill: async () => {
            return proc.kill();
          },
          wait: async () => {
            return proc.wait();
          },
          resize: async (cols: number, rows: number) => {
            return proc.resize(cols, rows);
          },
          streams: async () => {
            return comlink.transfer(
              {
                writable: proc.pty_stream_writer,
                readable: proc.pty_stream_reader,
              },
              [proc.pty_stream_reader, proc.pty_stream_writer],
            );
          },
        });
      },
      async openProcess(cmd: string, args: string[]) {
        const conn = await connection.promise;

        const proc = await conn.start_process(cmd, args);

        return comlink.proxy({
          kill: async () => {
            return proc.kill();
          },
          wait: async () => {
            return proc.wait();
          },
          streams: async () => {
            return comlink.transfer(
              {
                stdin: proc.stdin_stream,
                stdout: proc.stdout_stream,
                stderr: proc.stderr_stream,
              },
              [proc.stdin_stream, proc.stdout_stream, proc.stderr_stream],
            );
          },
        });
      },
    };
    comlink.expose(e, param.extensionApi);
    console.debug(
      "[Worker] Extension API exposed, returning connection proxy.",
    );

    return comlink.proxy(
      new Connection(
        vmi,
        param.fileSystemPort,
        param.serialConsolePort,
        param.extensionApi as MessagePort,
      ),
    );
  }
}
const workerHandler = new WorkerHandler();
self.onmessage = (e) => {
  const port = e.ports[0];
  comlink.expose(workerHandler, port);
  port.start();
  if (e.data.start) {
    if (e.data?.emulatorConfig?.["doNotStartEmulator"]) {
      console.debug(
        "[Worker] Skipping emulator boot — doNotStartEmulator set in config.",
      );
      vm_instance.Resolve(null);
      setTimeout(() => {
        progressGroup.forEach((v) => {
          v.postMessage({
            type: "downloadDone",
          });
        });
        progressGroup = [];
      }, 100);
      return;
    }
    const gsrvroot = () => (e.data.basePath as string) ?? getSrvRoot();
    startEmulator(gsrvroot, e.data.emulatorConfig);
  }
};
/**
 * Required files:
 * - disk (download from github repository)
 * - bzImage (download from github repository)
 * - seabios.bin (provided)
 * - vgabios.bin (provided)
 * - libv86.mjs (provided)
 * - initrd (download from github repository)
 * - v86.wasm (provided)
 * If these files are not provided, an error will be passed back to the main thread that will talk about what file was missing.
 * @param getSrvRoot Gets the server root through a function. May be customized if CDN or some other source is used.
 * @returns {Promise<void>}
 */
async function downloadAndCacheStaticFile(
  url: string,
  cachePath: string,
  cacheKey: string,
): Promise<void> {
  if ((await localforage.keys()).includes(cacheKey)) return;
  console.debug(`[Worker] ${cacheKey} not cached, downloading from ${url}...`);
  await fsP.mkdir(px.dirname(cachePath), { recursive: true });
  await fsP.writeFile(cachePath, new Uint8Array(0));
  const r = await fetch(url, {
    cache: "no-cache"
  });
  if (!r.ok) throw new Error(`Failed to download ${url}: ${r.status}`);
  const fh = await webfs.get("file", cachePath);
  await r.body!.pipeTo(await fh.createWritable());
  await localforage.setItem(cacheKey, true);
  console.debug(`[Worker] ${cacheKey} cached successfully.`);
}

async function readCachedStaticFile(cachePath: string): Promise<ArrayBuffer> {
  const fh = await webfs.get("file", cachePath);
  return (await fh.getFile()).arrayBuffer();
}
const kBase_Version = "0.0.1"; // do not change this unless updating everything at once

async function startEmulator(
  getSrvRoot: () => string,
  emulatorConfig?: Record<string, any>,
) {
  const v86 = await downloadV86(getSrvRoot);
  const disk_version = emulatorConfig?.["disk_version"] ?? kBase_Version;
  workerHandler.disk_version.Resolve(disk_version);
  if (!(await localforage.keys()).includes("disk_downloaded-"+disk_version)) {
    const resolvedDiskPath =
      emulatorConfig?.["diskPath"] ??
      (() => {
        console.warn(
          "[Worker] No diskPath specified in emulatorConfig, falling back to base path for disk image. This may cause unnecessary R2 requests.",
        );
        return getSrvRoot() + "disk";
      })();
    console.debug("[Worker] Disk image not cached, downloading from server...");
    try {
      const r = await fetch(resolvedDiskPath, {cache: "no-store"});
      
      if (!r.ok) {
        throw new Error("Failed to download disk image.");
      }
      
      const b = r.body!;
      if (!b) {
        throw new Error("Could not retreive response body");
      }
      
      const reader = b.pipeThrough(new DecompressionStream("gzip")).getReader();
      let off = 0;
      function onProgress(total: number, loaded: number) {
        progressGroup.forEach((evt) => {
          evt.postMessage({
            type: "progress",
            total,
            loaded,
          });
        });
      }
      await fsP.mkdir("/root", { recursive: true });
      await fsP.writeFile("/root/root.img", new Uint8Array(0));
      const fh = await webfs.get("file", "/root/root.img");
      const writ = await fh.createSyncAccessHandle();
      while (true) {
        const ch = await reader.read();
        if (ch.done) {
          //value is null
          break;
        }
        onProgress(1 * 1024 * 1024 * 1024, off);
        writ.write(ch.value, { at: off });
        off += ch.value.length;
      }
      const siz = writ.getSize();
      writ.close();
      webfs.index.get("/root/root.img")?.update({
        size: siz,
      });

      // disk_storage = diskBuffer;
      // try {
      //     await localforage.setItem("disk_downloaded", diskBuffer);
      // } catch { };
      await localforage.setItem("disk_downloaded-"+disk_version, true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(e);
      progressGroup.forEach((port) => {
        port.postMessage({ type: "downloadError", message });
      });
      return;
    }
  }

  await downloadAndCacheStaticFile(
    emulatorConfig?.["bzImagePath"] ?? getSrvRoot() + "bzImage",
    "/__cache__/bzImage",
    "bzimage_cached-"+((emulatorConfig?.['bzImage_version'])??kBase_Version),
  );
  await downloadAndCacheStaticFile(
    emulatorConfig?.["initrdPath"] ?? getSrvRoot() + "initrd",
    "/__cache__/initrd",
    "initrd_cached-"+(emulatorConfig?.['initrd_version']??kBase_Version),
  );
  const bzImageBuffer = await readCachedStaticFile("/__cache__/bzImage");
  const initrdBuffer = await readCachedStaticFile("/__cache__/initrd");

  setTimeout(() => {
    progressGroup.forEach((v) => {
      v.postMessage({
        type: "downloadDone",
      });
    });
    progressGroup = [];
  }, 1000);
  const uri = new URL(getSrvRoot(), location.origin);
  uri.protocol = "http:";
  const initArgs = [uri.href, "sdjfksjf"];
  const initArgsB64 = initArgs.map((v) => btoa(v));
  const final = initArgsB64.join(" ");

  const v86_startupoptions = {
    bios: {
      url: getSrvRoot() + "seabios.bin",
    },
    vga_bios: {
      url: getSrvRoot() + "vgabios.bin",
    },
    bzimage: {
      buffer: bzImageBuffer,
    },
    // },
    // hda,
    cmdline: `console=ttyS0 tsc=reliable`,
    wasm_path: `${getSrvRoot()}v86.wasm`,
    memory_size: 1024 * 1024 * 512,
    disable_keyboard: true,
    disable_mouse: true,
    virtio_console: true,
    autostart: true,
    filesystem: {
      handle9p: getHandler(fsRouter),
    },
    initrd: {
      buffer: initrdBuffer,
    },
    net_device: {
      type: "virtio",
      relay_url: "fetch",
      fetch: async (url: string, opts: any) => {
        if (url.includes("registry.npmjs.org")) {
          console.warn("[WARN] removing registry.npmjs.org headers]");

          delete opts.headers;
          opts = undefined;
        }
        return await fetch(url, opts);
      },
    },
  };
  const initinstance = new v86.V86({
    ...v86_startupoptions,
    ...emulatorConfig,
  });
  Object.defineProperty(self, "emulator", {
    value: initinstance,
    configurable: true,
    writable: true,
  });
  // Object.defineProperty(self, 'msgLoop', {value: new MessageLoop(), configurable: true, writable: true});
  initinstance.add_listener(
    "download-error",
    ({ file_name: filename }: { file_name: string }) => {
      progressGroup.forEach((port) => {
        port.postMessage({
          type: "downloadError",
          message: `v86 failed to download: ${filename}`,
        });
      });
      vm_instance.Resolve(initinstance);
    },
  );
  initinstance.add_listener("emulator-ready", async () => {
    vm_instance.Resolve(initinstance);
    const readyBuf = new Uint8Array();
    initinstance.add_listener(getReadFrom(1), function _ref(dat: Uint8Array) {
      console.debug(
        "[Worker] Emulator ready, setting up virtio serial streams.",
      );
      const rs = new ReadableStream<Uint8Array>({
        start(controller) {
          initinstance.add_listener(getReadFrom(0), (dat: Uint8Array) => {
            controller.enqueue(dat);
          });
        },
      });
      const SERIAL_CHUNK = 4096;
      const ws = new WritableStream<Uint8Array>({
        async write(chunk) {
          for (let offset = 0; offset < chunk.byteLength; offset += SERIAL_CHUNK) {
            initinstance.bus.send(getWriteTo(0), chunk.subarray(offset, offset + SERIAL_CHUNK));
            await new Promise<void>(resolve => setTimeout(resolve, 10));
          }
        },
      }, new ByteLengthQueuingStrategy({ highWaterMark: SERIAL_CHUNK }));
      connection.Resolve(new ConnectionClient(rs, ws));
      initinstance.remove_listener(getReadFrom(1), _ref);
    });
  });
}

// export type {WorkerHandlerAPI};
self.postMessage({ msg: "ready" });
