import { FileHandle } from '@zenfs/core/node/promises.js';
import { MarshallArray, Unmarshall } from '../struct';
import { type Dir } from '@zenfs/core';

import * as p from 'path';
import { O_APPEND, O_EXCL, O_RDWR, O_TRUNC, O_WRONLY, S_IFDIR, S_IFMT, S_IFREG } from '@zenfs/core/constants.js';
import { Exception, withErrno } from 'kerium';
import { DirType } from '@zenfs/core/vfs/dir.js';
import { fsP, webfs } from '.';
enum p9_qid_t {
    P9_QTDIR = 0x80,
    P9_QTAPPEND = 0x40,
    P9_QTEXCL = 0x20,
    P9_QTMOUNT = 0x10,
    P9_QTAUTH = 0x08,
    P9_QTTMP = 0x04,
    P9_QTSYMLINK = 0x02,
    P9_QTLINK = 0x01,
    P9_QTFILE = 0x00,
};
const P9_SETATTR_MODE = 0x00000001;
const P9_SETATTR_UID = 0x00000002;
const P9_SETATTR_GID = 0x00000004;
const P9_SETATTR_SIZE = 0x00000008;
const P9_SETATTR_ATIME = 0x00000010;
const P9_SETATTR_MTIME = 0x00000020;
const P9_SETATTR_CTIME = 0x00000040;
const P9_SETATTR_ATIME_SET = 0x00000080;
const P9_SETATTR_MTIME_SET = 0x00000100;
const {
    P9_QTDIR} = p9_qid_t;
enum p9_msg_t {
    P9_TLERROR = 6,
    P9_RLERROR,
    P9_TSTATFS = 8,
    P9_RSTATFS,
    P9_TLOPEN = 12,
    P9_RLOPEN,
    P9_TLCREATE = 14,
    P9_RLCREATE,
    P9_TSYMLINK = 16,
    P9_RSYMLINK,
    P9_TMKNOD = 18,
    P9_RMKNOD,
    P9_TRENAME = 20,
    P9_RRENAME,
    P9_TREADLINK = 22,
    P9_RREADLINK,
    P9_TGETATTR = 24,
    P9_RGETATTR,
    P9_TSETATTR = 26,
    P9_RSETATTR,
    P9_TXATTRWALK = 30,
    P9_RXATTRWALK,
    P9_TXATTRCREATE = 32,
    P9_RXATTRCREATE,
    P9_TREADDIR = 40,
    P9_RREADDIR,
    P9_TFSYNC = 50,
    P9_RFSYNC,
    P9_TLOCK = 52,
    P9_RLOCK,
    P9_TGETLOCK = 54,
    P9_RGETLOCK,
    P9_TLINK = 70,
    P9_RLINK,
    P9_TMKDIR = 72,
    P9_RMKDIR,
    P9_TRENAMEAT = 74,
    P9_RRENAMEAT,
    P9_TUNLINKAT = 76,
    P9_RUNLINKAT,
    P9_TVERSION = 100,
    P9_RVERSION,
    P9_TAUTH = 102,
    P9_RAUTH,
    P9_TATTACH = 104,
    P9_RATTACH,
    P9_TERROR = 106,
    P9_RERROR,
    P9_TFLUSH = 108,
    P9_RFLUSH,
    P9_TWALK = 110,
    P9_RWALK,
    P9_TOPEN = 112,
    P9_ROPEN,
    P9_TCREATE = 114,
    P9_RCREATE,
    P9_TREAD = 116,
    P9_RREAD,
    P9_TWRITE = 118,
    P9_RWRITE,
    P9_TCLUNK = 120,
    P9_RCLUNK,
    P9_TREMOVE = 122,
    P9_RREMOVE,
    P9_TSTAT = 124,
    P9_RSTAT,
    P9_TWSTAT = 126,
    P9_RWSTAT,
};

interface Qid { type: number, version: number, path: bigint };
interface QidWithPath extends Qid { pathId: string };

function openFlagsToString(fs: typeof import('.').fsP, flags: number) {
  const result = [];
  const { constants } = fs;

  // 1. Handle Access Modes (Special case because O_RDONLY is usually 0)
  // We use O_ACCMODE (0x3) to isolate the lower 2 bits.
  const accMode = flags & 0x3;
  if (accMode === constants.O_RDONLY) result.push('O_RDONLY');
  else if (accMode === constants.O_WRONLY) result.push('O_WRONLY');
  else if (accMode === constants.O_RDWR) result.push('O_RDWR');

  // 2. Check for individual status/creation flags
  const otherFlags = [
    { name: 'O_CREAT', value: constants.O_CREAT },
    { name: 'O_EXCL', value: constants.O_EXCL },
    { name: 'O_TRUNC', value: constants.O_TRUNC },
    { name: 'O_APPEND', value: constants.O_APPEND },
    { name: 'O_NONBLOCK', value: constants.O_NONBLOCK },
    { name: 'O_SYNC', value: constants.O_SYNC },
    { name: 'O_DIRECTORY', value: constants.O_DIRECTORY },
    { name: 'O_NOFOLLOW', value: constants.O_NOFOLLOW },
  ];

  for (const { name, value } of otherFlags) {
    if (value && (flags & value) === value) {
      result.push(name);
    }
  }

  return result.join('|');
}

class FidInfo implements Qid {
    type: number = 0;
    version: number = 0;
    path: bigint = 0n;
    pathId: string = "";
    handle?: Dir | FileHandle;
    fs: typeof import('@zenfs/core').fs.promises;
    parentHandle: FidInfo | null = null;
    buffer: Uint8Array = new Uint8Array();
    childrenCache: Map<string, FidInfo> = new Map(); // Cache children by name
    async moveTo(oldName: string, newDfid: FidInfo, newName: string) {
        await this.fs.rename(p.resolve(this.pathId, oldName), p.resolve(newDfid.pathId, newName));
        // Remove from old parent's cache
        this.childrenCache.delete(oldName);
        // Invalidate new parent's cache if the new name already existed
        newDfid.childrenCache.delete(newName);
    }
    async link(name: string, toPath: string) {

        await this.fs.link(p.resolve(this.pathId, name), toPath);
    }
    async truncate(nwSize: number) {
        await this.fs.truncate(this.pathId, nwSize);
    }
    async utime(newMtime: bigint, newAtime: bigint) {
        await this.fs.utimes(this.pathId, Number(newAtime), Number(newMtime));
    }
    async chown(uid: number, gid: number) {
        await this.fs.chown(this.pathId, uid, gid);
    }
    async chmod(nwMode: number) {
        await this.fs.chmod(this.pathId, nwMode);
    }
    constructor(fs: typeof import('@zenfs/core').fs.promises, {
        version, path, pathId, type
    }: QidWithPath, parentHandle: FidInfo | null = null) {
        this.type = type;
        this.version = version;
        this.path = path;
        this.fs = fs;
        this.pathId = pathId;
        this.parentHandle = parentHandle;

    }
    async readlink() {
        return await this.fs.readlink(this.pathId);
    }
    async symlink(name: string, tgt: string, gid: number) {
        let symlinkPath = p.resolve(this.pathId, name);
        await this.fs.symlink(tgt, symlinkPath);
        await this.fs.chown(symlinkPath, 0, gid);
        return this.walk(name);
    }
    async mknod() {
        throw withErrno('ENOTSUP', "Mknod() is not supported.")
    }
    async mkdir(name: string, mode: number, gid: number) {
        await this.fs.mkdir(p.resolve(this.pathId, name), {mode});
        await this.fs.chown(p.resolve(this.pathId, name), 0, gid);
    }
    async open(mode: number) {
        let { fs } = this;
        if (this.type & P9_QTDIR) {
            this.handle = await fs.opendir(this.pathId);
            let ad = await Array.fromAsync(this.handle);

            let infos = ad.map(v => {
                return {
                    type: v.type,
                    name: v.name
                };
            });
            infos.push({ name: "..", type: DirType.DIR });
            infos.push({ name: ".", type: DirType.DIR });

            let totalSize = infos.reduce((prevVal, curVal) => {
                return curVal.name.length + 2 + 1 + 8 + 13 + prevVal;
            }, 0);
            let u8 = new Uint8Array(totalSize);
            let off = 0;

            for (let { name, type } of infos) {
                let entSize = name.length + 2 + 1 + 8 + 13;
                u8.set(MarshallArray([
                    ["u8array", fmtQid(await this.walk(name))],
                    ["u64", BigInt(off + entSize)],
                    ['u8', type],
                    ['u16', name.length],
                    ["s", name]
                ]), off);
                off += entSize;
            }
            this.buffer = u8;
        } else {
            this.handle = await fs.open(this.pathId, mode&~O_EXCL);

        }

    }
    async stat() {

        return await this.fs.stat(this.pathId, { bigint: true });
    }
    async unlink(name: string) {
        let statsInfo = await this.fs.stat(p.resolve(this.pathId, name));
        if (statsInfo.isDirectory()) {
            await this.fs.rmdir(p.resolve(this.pathId, name));
        } else {
            await this.fs.unlink(p.resolve(this.pathId, name));
        }
        // Remove from cache after deletion
        this.childrenCache.delete(name);
    }
    async clunk() {

        await this.handle?.close();
    }
    async walk(name: string): Promise<FidInfo> {
        let { fs } = this;

        // Check children cache first - return existing child if available
        if (this.childrenCache.has(name)) {
            return this.childrenCache.get(name)!;
        }

        let npId = p.resolve(this.pathId, name);
        let stats = await fs.stat(npId); // exception will be thrown if it does nto exist!
        let qid: QidWithPath = {
            type: 0,
            version: 0,
            pathId: npId,
            path: BigInt(stats.ino)
        };


        if ((stats.mode & S_IFMT) === S_IFDIR) {
            qid.type = P9_QTDIR;
        }
        qid.version = 0;

        let newFidInfo: FidInfo;
        if ((stats.mode & S_IFMT) === S_IFREG) {
            newFidInfo = new RawAccesHandle(this.fs, qid, this);
        } else {
            newFidInfo = new FidInfo(this.fs, qid, this);
        }

        // Store child in cache
        this.childrenCache.set(name, newFidInfo);

        return newFidInfo;
    }


    async write(data: Uint8Array, position: number) {
        if (!this.handle) {
            throw withErrno("EBADF", "Tried to write without preparing for I/O with open()");
        }
        if (!(this.handle instanceof FileHandle)) {
            throw withErrno("EISDIR", "Tried to write data to a directory");
        }
        let beforeDat: Uint8Array|null = null;
        
        let a =  await this.handle.write(data, { position, length: data.length});
        
        return a;
    }
    async sync() {
        // no sync needed.
    }
    async read(position: number, length: number, buffer: Uint8Array): Promise<number> {
        if (this.handle instanceof FileHandle) {
            let lbl = "R " + this.pathId + "pos: " + position + "len: " + length
            
            let ret =(await this.handle.read(buffer, 0, length, position)).bytesRead;
            return ret;
        }
        else {
            let readFrom = this.buffer.subarray(position, Math.min(this.buffer.length, position + length));
            buffer.set(readFrom);
            return readFrom.length;
        }
    }
    async create(name: string, mode: number, gid: number) {
        let { fs } = this;
        let filePath = p.resolve(this.pathId, name);
        await fs.writeFile(filePath, "");
        await fs.chmod(filePath, mode);
        await fs.chown(filePath, 0, gid);
        return await this.walk(name);
    }
    getHandle() {
        return this.handle;
    }
    asQid(): Qid {
        let { path, version, type } = this;
        return { path, version, type };
    }
}
class RawAccesHandle extends FidInfo {
    opfsHandle?: FileSystemSyncAccessHandle;
    private openMode: number = 0;

    private readonly BLOCK_SIZE = 65536;
    private readonly MAX_CACHED_BLOCKS = 4096;
    private readonly READAHEAD_BLOCKS = 16;

    private blockCache: Map<number, { buffer: Uint8Array, length: number }> = new Map();
    
    private static bufferPool: Uint8Array[] = [];
    private static readonly MAX_POOL_SIZE = 64;
    
    private acquireBuffer(): Uint8Array {
        return RawAccesHandle.bufferPool.pop() ?? new Uint8Array(this.BLOCK_SIZE);
    }
    
    private releaseBuffer(buf: Uint8Array): void {
        if (buf.length === this.BLOCK_SIZE && RawAccesHandle.bufferPool.length < RawAccesHandle.MAX_POOL_SIZE) {
            RawAccesHandle.bufferPool.push(buf);
        }
    }
    async updateMeta() {
        let ino = webfs.index.get(this.pathId);
        ino?.update({size: this.opfsHandle?.getSize(), mtimeMs: Math.floor(performance.now()), atimeMs: Math.floor(performance.now())});
    }

    async truncate(newSize: number): Promise<void> {
        if (!this.opfsHandle) {
            // If file is not open, use the base class implementation
            await super.truncate(newSize);
            return;
        }

        const oldSize = this.opfsHandle.getSize();
        this.opfsHandle.truncate(newSize);
        this.opfsHandle.flush();

        // If file was shrunk, invalidate all affected blocks
        if (newSize < oldSize) {
            const firstAffectedBlock = Math.floor(newSize / this.BLOCK_SIZE);
            // Remove all blocks from firstAffectedBlock onwards
            for (const [blockNum, entry] of this.blockCache.entries()) {
                if (blockNum >= firstAffectedBlock) {
                    this.releaseBuffer(entry.buffer);
                    this.blockCache.delete(blockNum);
                }
            }
        } else if (newSize > oldSize) {
            // If file was extended, invalidate the last block of the old size
            // as it may now contain zeros
            const lastOldBlock = Math.floor(oldSize / this.BLOCK_SIZE);
            const entry = this.blockCache.get(lastOldBlock);
            if (entry) {
                this.releaseBuffer(entry.buffer);
                this.blockCache.delete(lastOldBlock);
            }
        }

        await this.updateMeta();
    }

    async open(mode: number): Promise<void> {
        if (this.type !== 0) {
            throw new Error("cant use raw access with directories");
        }

        this.openMode = mode;
        this.opfsHandle = await (await webfs.get("file", this.pathId)).createSyncAccessHandle();
        let idx = webfs.index.get(this.pathId);
        console.log(idx?.size);
        idx && this.opfsHandle.truncate(idx.size);
        console.log("Truncate?: " + ((mode & O_TRUNC) === O_TRUNC))
        console.log(openFlagsToString(this.fs, mode));

        if (mode & O_TRUNC) {
            this.opfsHandle.truncate(0);
            this.opfsHandle.flush();
            this.invalidateCache();
            await this.updateMeta();
        }
    }

    async write(data: Uint8Array, position: number): Promise<{ bytesWritten: number; buffer: Uint8Array<ArrayBufferLike>; }> {
        if (!this.opfsHandle) {
            throw new Error("Writing without preparing for I/O.");
        }

        // Validate write permission
        const accessMode = this.openMode & 0x3;
        if (accessMode === 0) { // O_RDONLY
            throw withErrno("EBADF", "File not opened for writing");
        }

        // Handle O_APPEND: always write to end of file
        let writePosition = position;
        if (this.openMode & O_APPEND) {
            writePosition = this.opfsHandle.getSize();
        }

        const startBlock = Math.floor(writePosition / this.BLOCK_SIZE);
        const endBlock = Math.floor((writePosition + data.length - 1) / this.BLOCK_SIZE);
        for (let b = startBlock; b <= endBlock; b++) {
            const entry = this.blockCache.get(b);
            if (entry) {
                this.releaseBuffer(entry.buffer);
                this.blockCache.delete(b);
            }
        }

        let bytesWritten = this.opfsHandle.write(data, { at: writePosition });
        await this.updateMeta();

        return { bytesWritten, buffer: data };
    }

    async read(position: number, length: number, buffer: Uint8Array): Promise<number> {
            const t0 = performance.now();

        if (!this.opfsHandle) {
            throw new Error("Reading without preparing for I/O.");
        }

        // Validate read permission
        const accessMode = this.openMode & 0x3;
        if (accessMode === O_WRONLY) {
            throw withErrno("EBADF", "File not opened for reading");
        }

        const startBlock = Math.floor(position / this.BLOCK_SIZE);
        const endBlock = Math.floor((position + length - 1) / this.BLOCK_SIZE);

        let bufferOffset = 0;

        for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
            
            const t1 = performance.now();
        const block = this.getBlock(blockNum);
        const t2 = performance.now();
        
        
            const blockStart = blockNum * this.BLOCK_SIZE;
            const readStart = Math.max(position, blockStart);
            const readEnd = Math.min(position + length, blockStart + block.length);
            
            const offsetInBlock = readStart - blockStart;
            const copyLength = readEnd - readStart;
            
            if (copyLength <= 0) break;

            buffer.set(block.buffer.subarray(offsetInBlock, offsetInBlock + copyLength), bufferOffset);
            bufferOffset += copyLength;
        }

    this.readAhead(endBlock + 1);


        return bufferOffset;
    }

    private getBlock(blockNum: number): { buffer: Uint8Array, length: number } {
        const cached = this.blockCache.get(blockNum);
        if (cached) {
            this.blockCache.delete(blockNum);
            this.blockCache.set(blockNum, cached);
            return cached;
        }
        return this.fetchBlock(blockNum);
    }

    private fetchBlock(blockNum: number): { buffer: Uint8Array, length: number } {
        const blockStart = blockNum * this.BLOCK_SIZE;
        const buffer = this.acquireBuffer();
        const bytesRead = this.opfsHandle!.read(buffer, { at: blockStart });

        const entry = { buffer, length: bytesRead };
        if (this.blockCache.size >= this.MAX_CACHED_BLOCKS) {
            const firstKey = this.blockCache.keys().next().value!;
            const evicted = this.blockCache.get(firstKey)!;
            this.releaseBuffer(evicted.buffer);
            this.blockCache.delete(firstKey);
        }

        this.blockCache.set(blockNum, entry);
        return entry;
    }

    private readAhead(startBlockNum: number): void {
        if (this.blockCache.size >= this.MAX_CACHED_BLOCKS - this.READAHEAD_BLOCKS) {
            return;
        }

        const fileSize = this.opfsHandle!.getSize();

        for (let i = 0; i < this.READAHEAD_BLOCKS; i++) {
            const blockNum = startBlockNum + i;
            
            if (this.blockCache.has(blockNum)) continue;
            
            const blockStart = blockNum * this.BLOCK_SIZE;
            if (blockStart >= fileSize) break;

            this.fetchBlock(blockNum);
        }
    }

    private invalidateCache(): void {
        for (const entry of this.blockCache.values()) {
            this.releaseBuffer(entry.buffer);
        }
        this.blockCache.clear();
    }

    async sync(): Promise<void> {
        if (this.opfsHandle) {
            this.opfsHandle.flush();
        }
    }

    async clunk(): Promise<void> {
        await super.clunk();
        this.opfsHandle?.flush();
        this.opfsHandle?.close();
        this.opfsHandle = undefined;
        this.invalidateCache();
    }
}
function fmtQid(qid: Qid) {
    return MarshallArray([
        ['u8', qid.type],
        ['u32', qid.version],
        ["u64", qid.path]
    ]);
}
async function getRootFidInfo(fs: typeof import('@zenfs/core').fs.promises) {
    let fa = await fs.stat('/');
    let fidInfo = new FidInfo(fs, { type: P9_QTDIR, pathId: "/", path: BigInt(fa.ino), version: 0 }, null);
    return fidInfo;

}

function getHandler() {
    let fids: Record<number, FidInfo> = {};
    let tagsFlushed: Set<number> = new Set();
    let msize = 0;
    let rootFidInfo: FidInfo | null = null;

    async function p9handler(fs: typeof import('.').fsP, request: Uint8Array, respond: (response: Uint8Array) => void) {
        let [off, { tag, length, method }] = Unmarshall(request, {
            "length": ["u32"],
            "method": ["u8"],
            tag: ["u16"]
        }, {littleEndian: true});
        let [, { msgbytes }] = Unmarshall(request, { msgbytes: ["u8array", length - 4 - 1 - 2] }, { byteOffset: off })
        let methodSpecific: Uint8Array | null = null;
        let methodNum = method as p9_msg_t;

        let retMethod = method + 1;

        try {
            switch (methodNum) {
                // statfs
                case p9_msg_t.P9_TLERROR: {
                    throw new Error("Should not receive this.");
                }
                case p9_msg_t.P9_TSTATFS: {
                    let stats = await fs.statfs('/');
                    methodSpecific = MarshallArray([
                        ["u32", stats.type],
                        ['u64', BigInt(8192)],
                        ['u64', BigInt(Math.floor(stats.blocks))],
                        ['u64', BigInt(Math.floor(stats.bfree))],
                        ['u64', BigInt(Math.floor(stats.bavail))],
                        ["u64", BigInt(Math.floor(stats.files))],
                        ["u64", BigInt(Math.floor(stats.ffree))],
                        ["u64", 0n],
                        ['u32', 255]
                    ]);
                    break;
                }
                case p9_msg_t.P9_TLOPEN: {
                    console.time("OPEN");
                    let [, { fid, flags }] = Unmarshall(msgbytes, {
                        fid: ['u32'],
                        flags: ['u32']
                    });
                    let fidInfo = fids[fid];
                    if (!fidInfo) {
                        throw withErrno("EINVAL");
                    }
                    await fidInfo.open(flags);
                    let qid = fidInfo.asQid();
                    console.log("Using msize: " + msize);
                    methodSpecific = MarshallArray([
                        ["u8array", fmtQid(qid)],
                        ["u32", msize - 24]
                    ]);
                    console.timeEnd("OPEN")
                    break;

                }
                case p9_msg_t.P9_TLCREATE: {
                    let [, { fid, name, flags, mode, gid }] = Unmarshall(msgbytes, {
                        fid: ["u32"],
                        name: ["sl"],
                        flags: ["u32"],
                        mode: ["u32"],
                        gid: ["u32"]
                    });
                    let pFid = fids[fid];
                    let newQid = await pFid.create(name, mode, gid);
                    // Replace parent fid with the newly created file's fid
                    fids[fid] = newQid;
                    // Open the file with specified flags
                    await newQid.open(flags);
                    methodSpecific = MarshallArray([
                        ["u8array", fmtQid(newQid)],
                        ["u32", 1024 * 1024]
                    ]);
                    break;
                }
                case p9_msg_t.P9_TSYMLINK: {
                    let [, { fid, name, symtgt, gid }] = Unmarshall(msgbytes, {
                        fid: ["u32"],
                        name: ["sl"],
                        symtgt: ["sl"],
                        gid: ["u32"]
                    });
                    let f = fids[fid];
                    methodSpecific = fmtQid(await f.symlink(name, symtgt, gid));

                    break;
                }
                case p9_msg_t.P9_TMKNOD: {
                    throw withErrno("ENOTSUP", "mknod not supported.");
                }
                case p9_msg_t.P9_TRENAME: {
                    throw withErrno("ENOTSUP", "old rename not supported");
                }
                case p9_msg_t.P9_TREADLINK: {
                    let [, { f }] = Unmarshall(msgbytes, { f: ["u32"] });
                    let fidInf = fids[f];
                    methodSpecific = MarshallArray([["sl", await fidInf.readlink()]]);
                    break;
                }
                case p9_msg_t.P9_TGETATTR: {
                    let [, { fid, requestMask }] = Unmarshall(msgbytes, { fid: ["u32"], requestMask: ["u64"] });
                    //     size[4] Rgetattr tag[2] valid[8] qid[13] mode[4] uid[4] gid[4] nlink[8]
                    //  rdev[8] size[8] blksize[8] blocks[8]
                    //  atime_sec[8] atime_nsec[8] mtime_sec[8] mtime_nsec[8]
                    //  ctime_sec[8] ctime_nsec[8] btime_sec[8] btime_nsec[8]
                    //  gen[8] data_version[8]
                    let mfid = fids[fid];
                    let st = await mfid.stat();

                   
                    let nlink = BigInt(st.nlink);
                    if ((Number(st.mode) & S_IFMT) === S_IFDIR) {
                        if (nlink < 2n) nlink = 2n;
                    } else {
                        if (nlink < 1n) nlink = 1n;
                    }

                    methodSpecific = MarshallArray([
                        ["u64", requestMask],
                        ["u8array", fmtQid(mfid)],
                        ["u32", Number(st.mode)],
                        ["u32", Number(st.uid)],
                        ["u32", Number(st.gid)],
                        ["u64", nlink],
                        ["u64", BigInt(st.rdev)],
                        ["u64", BigInt(st.size)],
                        ["u64", BigInt(8192)],
                        ["u64", BigInt(st.size)/8192n],
                        ['u64', BigInt(st.atimeMs) / 1000n],
                        ['u64', BigInt(st.atimeNs)],
                        ['u64', BigInt(Math.floor(Number(st.mtimeMs))) / 1000n],
                        ["u64", BigInt(st.mtimeNs)],
                        ["u64", BigInt(st.ctimeMs) / 1000n],
                        ['u64', BigInt(st.ctimeNs)],
                        ["u64", BigInt(st.birthtimeMs) / 1000n],
                        ["u64", BigInt(st.birthtimeNs)],
                        ["u64", 0n],
                        ["u64", 0n]
                    ]);
                    break;
                }
                case p9_msg_t.P9_TSETATTR: {
                    //     tag[2] fid[4] valid[4] mode[4] uid[4] gid[4] size[8]
                    //  atime_sec[8] atime_nsec[8] mtime_sec[8] mtime_nsec[8]
                    let [, { fid, valid, mode, uid, gid, size, atime_sec, mtime_sec }] = Unmarshall(msgbytes, {
                        fid: ['u32'],
                        valid: ['u32'],
                        mode: ["u32"],
                        uid: ["u32"],
                        gid: ["u32"],
                        size: ["u64"],
                        atime_sec: ["u64"],
                        atime_nsec: ["u64"],
                        mtime_sec: ["u64"],
                        mtime_nsec: ["u64"]
                    });
                    let f = fids[fid];
                    if (valid & P9_SETATTR_MODE) {
                        await f.chmod(mode);
                    }
                    if ((valid & P9_SETATTR_UID) && (valid & P9_SETATTR_GID)) {
                        await f.chown(uid, gid);
                    }
                    let mtime = 0n, atime = 0n;
                    let now = BigInt(Date.now());
                    if (valid & P9_SETATTR_ATIME) {
                        atime = now;
                    }
                    if (valid & P9_SETATTR_MTIME) {
                        mtime = now;
                    }
                    if (valid & P9_SETATTR_CTIME) {
                    }
                    if (valid & P9_SETATTR_ATIME_SET) {
                        atime = atime_sec * 1000n; // assuming it will be sec, convert to ms
                    }
                    if (valid & P9_SETATTR_MTIME_SET) {
                        mtime = mtime_sec * 1000n; // assuming it will be sec, convert to ms
                    }
                    if (atime || mtime) {
                        await f.utime(mtime, atime);
                    }
                    if (valid & P9_SETATTR_SIZE) {
                        await f.truncate(Number(size));
                    }
                    // done.
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_TXATTRWALK: {
                    throw withErrno("ENOTSUP", "Extended attributes not supported");
                }
                case p9_msg_t.P9_TXATTRCREATE: {
                    throw withErrno("ENOTSUP", "Extended attributes not supported");
                }

                case p9_msg_t.P9_TREADDIR: {
                    let [, {fid, offset, count}] = Unmarshall(msgbytes, {fid: ["u32"], offset: ["u64"], count: ["u32"]});
                    let f = fids[fid];
                    let buffer = new Uint8Array(count);
                    let numRead = await f.read(Number(offset), count, buffer);
                    methodSpecific = MarshallArray([
                        ["u32", numRead],
                        ['u8array', buffer.subarray(0, numRead)]
                    ]);
                    break;
                }
                case p9_msg_t.P9_TFSYNC: {
                    let [, {fid}] = Unmarshall(msgbytes,{fid: ['u32'], datasync:['u32']});
                    let f = fids[fid];
                    await f.sync();
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_TLOCK: {
                    throw withErrno("ENOTSUP", "File locking not supported");
                }
                case p9_msg_t.P9_TGETLOCK: {
                    throw withErrno("ENOTSUP", "File locking not supported");
                }
                case p9_msg_t.P9_TLINK: {
                    let [, {dfid, fid, name}] = Unmarshall(msgbytes, {dfid: ["u32"], fid: ["u32"], name: ['sl']});
                    let parentFid = fids[dfid];
                    let refedFid = fids[fid];
                    await parentFid.link(name, refedFid.pathId);
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_TMKDIR: {
                    let [, {dfid, name, mode, gid}] = Unmarshall(msgbytes, {dfid: ["u32"], name: ["sl"], mode: ["u32"], gid: ["u32"]});
                    let parentFid = fids[dfid];
                    await parentFid.mkdir(name, mode, gid);
                    let newDirFid = await parentFid.walk(name);
                    methodSpecific = fmtQid(newDirFid.asQid());
                    break;
                }
                case p9_msg_t.P9_TRENAMEAT: {
                    //  olddirfid[4] oldname[s] newdirfid[4] newname[s]
                    let [,{olddirfid, oldname, newdirfid, nwname}] = Unmarshall(msgbytes, {olddirfid: ["u32"], oldname: ["sl"], newdirfid: ["u32"], nwname: ["sl"]});
                    let oldParent = fids[olddirfid];
                    let newParent = fids[newdirfid];
                    await oldParent.moveTo(oldname, newParent, nwname);
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_TUNLINKAT: {
                    // dirfd[4] name[s] flags[4]
                    let [, {dirfd, name}] = Unmarshall(msgbytes, {
                        dirfd: ["u32"],
                        name: ["sl"],
                        flags: ["u32"]
                    });
                    // brother

                    let d = fids[dirfd];
                    await d.unlink(name);
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_TVERSION: {
                    let [, {msizeu, version}] = Unmarshall(msgbytes, {
                        msizeu: ["u32"],
                        version: ["sl"]
                    });
                    msize = msizeu;
                    console.log("MSIZE: " + msize);
                    methodSpecific = MarshallArray([
                        ["u32", msize],
                        ["sl", "9P2000.L"]
                    ]);
                    break;
                }

                case p9_msg_t.P9_TAUTH: {
                    throw withErrno("ENOTSUP", "Authentication is not required.");
                }
                case p9_msg_t.P9_TATTACH: {
                    // fid[4] afid[4] uname[s] aname[s] n_uname[4]
                    let [, {fid, uname, n_uname}] = Unmarshall(msgbytes, {
                        fid: ["u32"],
                        afid: ["u32"],
                       uname: ["sl"],
                       aname: ["sl"] ,
                       n_uname: ["u32"]
                    });
                    console.info(`[INFO] 9p session established for ${uname}, uid: ${n_uname}`);
                    if (!rootFidInfo) {
                        rootFidInfo = await getRootFidInfo(fs);
                    }
                    fids[fid] = rootFidInfo;
                    methodSpecific = fmtQid(fids[fid].asQid());
                    break;
                }
                case p9_msg_t.P9_TERROR: {
                    throw withErrno("ENOTSUP", "terror should not happen.");
                }
                case p9_msg_t.P9_TFLUSH: {
                    tagsFlushed.add(tag);
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_RFLUSH: {
                    break;
                }
                case p9_msg_t.P9_TWALK: {
                    // fid[4] newfid[4] nwname[2] nwname*(wname[s])
                    let [off, {fid, newfid, numNwname}] = Unmarshall(msgbytes, {
                        fid: ["u32"],
                        newfid: ["u32"],
                        numNwname: ["u16"]
                    });

                    let currentPath = fids[fid];
                    if (!currentPath) {
                        throw withErrno("EINVAL", "Invalid fid");
                    }

                    let walkedPaths: Qid[] = [];

                    if (numNwname === 0) {
                        fids[newfid] = currentPath;
                        methodSpecific = MarshallArray([
                            ["u16", 0],
                            ["u8array", new Uint8Array(0)]
                        ]);
                        break;
                    }

                    for (let i = 0; i < numNwname; i++) {
                        let [newOff, {n}] = Unmarshall(msgbytes, {
                            n: ["sl"]
                        }, {byteOffset: off});
                        off = newOff;

                        try {
                            currentPath = await currentPath.walk(n);
                            walkedPaths.push(currentPath.asQid());
                        } catch (e) {
                            break;
                        }
                    }

                    if (walkedPaths.length === numNwname) {
                        fids[newfid] = currentPath;
                    }

                    let qidsData = new Uint8Array(walkedPaths.length * 13);
                    for (let i = 0; i < walkedPaths.length; i++) {
                        qidsData.set(fmtQid(walkedPaths[i]), i * 13);
                    }

                    methodSpecific = MarshallArray([
                        ["u16", walkedPaths.length],
                        ["u8array", qidsData]
                    ]);
                    break;
                }
                case p9_msg_t.P9_RWALK: {
                    break;
                }
                case p9_msg_t.P9_TOPEN: {
                    break;
                }
                case p9_msg_t.P9_ROPEN: {
                    break;
                }
                case p9_msg_t.P9_TCREATE: {
                    break;
                }
                case p9_msg_t.P9_RCREATE: {
                    break;
                }
                case p9_msg_t.P9_TREAD: {
                    // console.time("READ");
                    let [, {fid, offset, count}] = Unmarshall(msgbytes, {
                        fid: ["u32"],
                        offset: ["u64"],
                        count: ["u32"]
                    });
                    console.log("cnt: " + count);

                    let f = fids[fid];

                    // Pre-allocate response buffer: size(4) + method(1) + tag(2) + numRead(4) + data(count)
                    const maxResponseSize = 4 + 1 + 2 + 4 + count;
                    const response = new Uint8Array(maxResponseSize);
                    const view = new DataView(response.buffer);

                    // Read directly into response buffer at offset 11
                    let numRead = await f.read(Number(offset), count, response.subarray(11));

                    // Write header
                    const payloadSize = 4 + numRead;  // numRead field + data
                    const totalSize = 4 + 1 + 2 + payloadSize;
                    view.setUint32(0, totalSize, true);
                    view.setUint8(4, retMethod);
                    view.setUint16(5, tag, true);
                    view.setUint32(7, numRead, true);

                    respond(response.subarray(0, totalSize));
                    // console.timeEnd("READ");

                    return;
                }
                case p9_msg_t.P9_RREAD: {
                    break;
                }
                case p9_msg_t.P9_TWRITE: {
                    console.time("WRITE");
                    let [, {fid, offset, count}] = Unmarshall(msgbytes, {
                        fid: ["u32"],
                        offset: ["u64"],
                        count: ["u32"]
                    });

                    // Read data directly from msgbytes without extra allocation
                    const dataView = msgbytes.subarray(16, 16 + count);
                    let f = fids[fid];
                    let r = await f.write(dataView, Number(offset));

                    // Write response directly: size(4) + method(1) + tag(2) + bytesWritten(4)
                    const response = new Uint8Array(11);
                    const view = new DataView(response.buffer);
                    view.setUint32(0, 11, true);  // total size
                    view.setUint8(4, retMethod);
                    view.setUint16(5, tag, true);
                    view.setUint32(7, r.bytesWritten, true);

                    console.timeEnd("WRITE");
                    respond(response);
                    return;
                }
                case p9_msg_t.P9_RWRITE: {
                    break;
                }
                case p9_msg_t.P9_TCLUNK: {
                    let [, {fid}] = Unmarshall(msgbytes, {
                        fid: ["u32"]
                    });
                    let f = fids[fid];
                    if (f) {
                        await f.clunk();
                        delete fids[fid];
                    }
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_RCLUNK: {
                    break;
                }
                case p9_msg_t.P9_TREMOVE: {
                    let [, {fid}] = Unmarshall(msgbytes, {
                        fid: ["u32"]
                    });
                    let f = fids[fid];
                    if (f) {
                        if (f.parentHandle) {
                            let basename = p.basename(f.pathId);
                            await f.parentHandle.unlink(basename);
                        } else {
                            // Root cannot be removed
                            throw withErrno("EACCES", "Cannot remove root directory");
                        }
                        await f.clunk();
                        delete fids[fid];
                    }
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_RREMOVE: {
                    break;
                }
                case p9_msg_t.P9_TSTAT: {
                    break;
                }
                case p9_msg_t.P9_RSTAT: {
                    break;
                }
                case p9_msg_t.P9_TWSTAT: {
                    break;
                }
                case p9_msg_t.P9_RWSTAT: {
                    break;
                }
            }
            if (!methodSpecific) {
                throw withErrno("ENOTSUP", "no method handled this message");
            }
            if (tagsFlushed.has(tag)) {
                tagsFlushed.delete(tag);
                return;
            }
            let retBuffer = MarshallArray([
                ["u8", retMethod],
                ["u16", tag],
                ["u8array", methodSpecific]
            ]);
            let buf = MarshallArray([
                ["u32", retBuffer.length + 4],
                ['u8array', retBuffer]
            ]);
            respond(buf);
            return;
        } catch (e) {
            if (e instanceof Exception) {
                let errNum = e.errno;
                let dat = MarshallArray([
                    ["u8", p9_msg_t.P9_RLERROR],
                    ["u16", tag],
                    ["u32", errNum]

                ]);
                let ret = MarshallArray([
                    ["u32", dat.byteLength + 4],
                    ["u8array", dat]
                ]);
                respond(ret);
                return;
            } else {
                // rethrow
                throw e;
            }

        }
    }
    return p9handler.bind(null, fsP);
}

export { getHandler };