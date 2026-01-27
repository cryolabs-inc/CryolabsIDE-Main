import { fs, configureSingle, Async, FileSystem, type CreationOptions, type InodeLike, Inode, InMemory, constants, configure } from '@zenfs/core';
import { S_IFDIR, S_IFMT } from '@zenfs/core/constants.js';
import { WebAccess, WebAccessFS } from '@zenfs/dom';
import { withErrno } from 'kerium';
import path from 'path';
let rot = await navigator.storage.getDirectory();
let rootDir = await rot.getDirectoryHandle('files1', {create: true});
class WebAccess2 extends WebAccessFS {
    idxHandle: FileSystemFileHandle;
    constructor(rootHandle: FileSystemDirectoryHandle, indexHandle: FileSystemFileHandle, disableHandleCache = false) {
        super(rootHandle, disableHandleCache);
        this.idxHandle = indexHandle;
    }
    async initialize() {
        let fil = await this.idxHandle.getFile();
        if (fil.size === 0) {
            return; // no data.
        }
        let jso = await new Response(fil).json();
        this.index.fromJSON(jso);
    }
    async saveIndex() {
        let jsString = JSON.stringify(this.index.toJSON());
        let writable = await this.idxHandle.createWritable({keepExistingData: false});
        await writable.write(jsString);
        await writable.close();

    }
    protected async remove(path: string): Promise<void> {
        await super.remove(path);
        await this.saveIndex();
        
    }
    async write(path: string, buffer: Uint8Array, offset: number): Promise<void> {
        await super.write(path, buffer, offset);
        await this.saveIndex();

    }
    async _mkdir(path: string): Promise<void> {
        await super._mkdir(path);
        await this.saveIndex();
    }
}
let int  = new WebAccess2(await rot.getDirectoryHandle("f1", {create: true}), await rot.getFileHandle('index', {create: true}));
await int.initialize(); 
async function saveIndex() {
    let idx = await rot.getFileHandle('index', {create: true});
    let writable = await idx.createWritable({keepExistingData: false});
    await writable.write(JSON.stringify(int.index));
    await writable.close();
}
async function destroyIndex() {
    await rot.removeEntry('index', {recursive: false});
}
Object.defineProperty(globalThis, 'idx', {
    value: {saveIndex, destroyIndex}
});
await configure({mounts: {
    '/': int
}});

let fsP = fs.promises;
export { fs, saveIndex, int as webfs,  fsP};