import { fs, configureSingle, Async, FileSystem, type CreationOptions, type InodeLike, Inode, InMemory, constants, configure } from '@zenfs/core';
import { S_IFDIR, S_IFMT } from '@zenfs/core/constants.js';
import { WebAccess, WebAccessFS } from '@zenfs/dom';
import { convertException } from '@zenfs/dom/utils.js';
import { log, withErrno } from 'kerium';
import p from 'path';
import { _throw } from 'utilium';
let rot = await navigator.storage.getDirectory();
let rootDir = await rot.getDirectoryHandle('files1', {create: true});
class WebAccess2 extends WebAccessFS {
    idxHandle: FileSystemFileHandle;
    gettingIdx: boolean = false;
    constructor(rootHandle: FileSystemDirectoryHandle, indexHandle: FileSystemFileHandle, disableHandleCache = false) {
        super(rootHandle, disableHandleCache);
        this.idxHandle = indexHandle;
    }
    
    async initialize() {
        this.index.maxSize
        let fil = await this.idxHandle.getFile();
        if (fil.size === 0) {
            return; // no data.
        }
        let jso = await new Response(fil).json();
        this.index.fromJSON(jso);
    }
    async saveIndex() {
        navigator.locks.request("nlock-fs", {mode: "exclusive"}, (async()=>{
            let jsString = JSON.stringify(this.index.toJSON());
            
        let writable = await this.idxHandle.createWritable({keepExistingData: false});
        await writable.write(jsString);
        await writable.close();
        }));

    }
    protected async remove(path: string): Promise<void> {
        await super.remove(path);
        await this.saveIndex();
        
    }
    public async get<const T extends FileSystemHandleKind | null>(kind: T | undefined, path: string): Promise<T extends 'directory' ? FileSystemDirectoryHandle : T extends 'file' ? FileSystemFileHandle : FileSystemHandle> {
        
        return super.get(kind, path);

    }
    async write(path: string, buffer: Uint8Array, offset: number): Promise<void> {

		const inode = this.index.get(path);
		if (!inode) throw withErrno('ENOENT');

		const isDir = (inode.mode & constants.S_IFMT) == constants.S_IFDIR;

		let handle: FileSystemFileHandle | FileSystemDirectoryHandle;
		try {
			handle = await this.get(isDir ? 'directory' : 'file', path);
		} catch {
			const parent = await this.get('directory', p.dirname(path));
			handle = await parent[isDir ? 'getDirectoryHandle' : 'getFileHandle'](p.basename(path), { create: true }).catch((ex: DOMException) =>
				_throw(convertException(ex, path))
			);
			if (!this.disableHandleCache) this._handles.set(path, handle);
		}

		if (isDir) return;

		if (handle.kind === "directory") {
			log.crit(withErrno('EIO', 'Mismatch in entry kind on write'));
			return;
		}

		const writable = await handle.createWritable({ keepExistingData: true });

		try {
			await writable.seek(offset);
		} catch {
			await writable.write({ type: 'seek', position: offset });
		}
		await writable.write(buffer as Uint8Array<ArrayBuffer>); // We convert to a non-shared buffer above
		await writable.close();

		const { size, lastModified } = await handle.getFile();
		inode.update({ size, mtimeMs: lastModified });
		this.index.set(path, inode);

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