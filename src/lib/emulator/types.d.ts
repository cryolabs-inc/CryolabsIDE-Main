import type { Disposable } from "$lib/base/disposable";
import type { FSChange } from "$lib/base/fs/changes";
import type { Stats } from "@zenfs/core";

export interface ConnectParams {
    fileSystemPort: MessagePort,
    serialConsolePort: MessagePort,
    extensionApi?: MessagePort
}
export interface ShellAPI  {
	/**
	 * 
	 * API to send a message to the PTY
	 * You must await this promise. If you don't await the promise, you may face undefined behaviour
	 * 
	 */
	send(data: Uint8Array): Promise<void>

	/**
	 * pull chunk of data
	 */
	pull(): Promise<Uint8Array>
    /**
     * Close the pipe. Closing the pipe will kill all processes in the associated process group. User confirmation is recommended before calling.
     */
	close(): Promise<void>
}
type ProgressCallback = (loaded:number, total: number)=>void;
export interface GitAPI {
    establishGHToken(token: string): Promise<string>
    push(root: string, ): Promise<void>
}
export interface ExtensionAPI {
    onReadyCallback(callback: ()=>void): Promise<void>
    update(progressCallback: ProgressCallback): Promise<void>
	/**
	 * Open a pty to a shell. Helps users run isolated shells.
	 */
	openPtyToShell(cmd: string, dataCallback: (data: Uint8Array)=>void, closeCallback: ()=>void): Promise<ShellAPI>
}
interface FSDirent {
    name: string;
    dt_type: number;
    ino: number;
}

/**
 * Internal API for a virtual or custom file system provider.
 * This interface operates at the inode level and assumes a non-path-based model for most operations.
 * It is designed for high-performance, low-level file system manipulation.
 * This API is thread-safe. i.e. this can be accessed safely from mulitple threads and one VM is guaranteed to use the underlying fs with thread-safety.
 */
export interface FSProviderAPI {
    assignId(id: string): Promise<void>
    stat(path: string): Promise<Stats>
    readLargeFile(path: string): Promise<File>;
    writeFile(path: string, data: ArrayBuffer, length?: number, position?: number, openMode?: number): Promise<number>;
    readFile(path: string, length?: number, position?: number): Promise<Uint8Array>;
    ls(path: string): Promise<FSDirent[]>;
    watchForRefresh(refreshCb: (fsChange: FSChange)=>void): Promise<Disposable>;
    removeEntry(path: string): Promise<void>;
    removeDirectory(path: string, opts?: {recursive: boolean}): Promise<void>;
    renameEntry(path: string, newPath: string): Promise<void>;
    mkdir(path: string, opts?: {recursive: boolean}): Promise<void>;
    truncate(path: string, nwSize: number): Promise<void>;
    createFile(path: string): Promise<void>;
}

export interface Connection {
    fileSystemPort: MessagePort;
    serialConsolePort: MessagePort;
    fsImpl: FSProviderInternalAPIV1;
    new(fileSystemPort: MessagePort, serialConsolePort: MessagePort): Connection;
    
}

export interface WorkerHandlerAPI {
    
    connect(param: ConnectParams): Promise<Connection>;
}
type GetWorkerPortRequest = {
    type: "GetWorkerPortRequest"
};
type GetWorkerPortResponse = {
    type: "GetWorkerPortResponse",
    mode: "sessionleader"|"sessionchild",
    sessionLeaderLock?: string,
    msgPort: MessagePort
}
type LockAcquired = {
    type: "LockAcquired"
}
type WorkerMessageData = GetWorkerPortRequest|GetWorkerPortResponse|LockAcquired;
type Msg = MessageEvent<WorkerMessageData>;