import { MarshallArray, UnmarshallArray } from '../struct';
import p from 'path-browserify';
import { S_IFDIR, S_IFMT } from '@zenfs/core/constants.js';
import { Exception, withErrno } from 'kerium';
import { FileInfo, fmtQid, type Qid } from './file_info';
import type { FileSystemRouter } from './router';

const P9_SETATTR_MODE = 0x00000001;
const P9_SETATTR_UID = 0x00000002;
const P9_SETATTR_GID = 0x00000004;
const P9_SETATTR_SIZE = 0x00000008;
const P9_SETATTR_ATIME = 0x00000010;
const P9_SETATTR_MTIME = 0x00000020;
const P9_SETATTR_CTIME = 0x00000040;
const P9_SETATTR_ATIME_SET = 0x00000080;
const P9_SETATTR_MTIME_SET = 0x00000100;
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


function getHandler(router: FileSystemRouter) {
    const fids: Record<number, FileInfo> = {};
    const openModes: Record<number, number> = {};
    const tagsFlushed: Set<number> = new Set();
    let msize = 0;
    let rootFileInfo: FileInfo | null = null;

    async function p9handler(fs: typeof import('.').fsP, request: Uint8Array, respond: (response: Uint8Array) => void) {
        const [off, [length, method, tag]] = UnmarshallArray(request, [["u32"], ["u8"], ["u16"]]);
        const [, [msgbytes]] = UnmarshallArray(request, [["u8array", length - 4 - 1 - 2]], { byteOffset: off });
        let methodSpecific: Uint8Array | null = null;
        const methodNum = method as p9_msg_t;

        const retMethod = method + 1;

        try {
            switch (methodNum) {
                // statfs
                case p9_msg_t.P9_TLERROR: {
                    throw new Error("Should not receive this.");
                }
                case p9_msg_t.P9_TSTATFS: {
                    const stats = await fs.statfs('/');
                    // Inline: u32 + 7*u64 + u32 = 4 + 56 + 4 = 64 bytes
                    methodSpecific = new Uint8Array(64);
                    const statfsView = new DataView(methodSpecific.buffer);
                    statfsView.setUint32(0, stats.type, true);
                    statfsView.setBigUint64(4, 8192n, true);
                    statfsView.setBigUint64(12, BigInt(Math.floor(stats.blocks)), true);
                    statfsView.setBigUint64(20, BigInt(Math.floor(stats.bfree)), true);
                    statfsView.setBigUint64(28, BigInt(Math.floor(stats.bavail)), true);
                    statfsView.setBigUint64(36, BigInt(Math.floor(stats.files)), true);
                    statfsView.setBigUint64(44, BigInt(Math.floor(stats.ffree)), true);
                    statfsView.setBigUint64(52, 0n, true);
                    statfsView.setUint32(60, 255, true);
                    break;
                }
                case p9_msg_t.P9_TLOPEN: {
                    const [, [fid, flags]] = UnmarshallArray(msgbytes, [["u32"], ["u32"]]);
                    const fidInfo = fids[fid];
                    if (!fidInfo) {
                        throw withErrno("EINVAL");
                    }
                    await fidInfo.open(flags);
                    openModes[fid] = flags;
                    const qid = fidInfo.asQid();
                    methodSpecific = MarshallArray([
                        ["u8array", fmtQid(qid)],
                        ["u32", msize - 24]
                    ]);
                    break;

                }
                case p9_msg_t.P9_TLCREATE: {
                    const [, [fid, name, flags, mode, gid]] = UnmarshallArray(msgbytes, [["u32"], ["sl"], ["u32"], ["u32"], ["u32"]]);
                    const pFid = fids[fid];
                    const newQid = await pFid.create(name, mode, gid);
                    await pFid.clunk();
                    fids[fid] = newQid;
                    newQid.ref();
                    await newQid.open(flags);
                    openModes[fid] = flags;
                    methodSpecific = MarshallArray([
                        ["u8array", fmtQid(newQid)],
                        ["u32", 1024 * 1024]
                    ]);
                    break;
                }
                case p9_msg_t.P9_TSYMLINK: {
                    const [, [fid, name, symtgt, gid]] = UnmarshallArray(msgbytes, [["u32"], ["sl"], ["sl"], ["u32"]]);
                    const f = fids[fid];
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
                    const [, [f]] = UnmarshallArray(msgbytes, [["u32"]]);
                    const fidInf = fids[f];
                    methodSpecific = MarshallArray([["sl", await fidInf.readlink()]]);
                    break;
                }
                case p9_msg_t.P9_TGETATTR: {
                    const [, [fid, requestMask]] = UnmarshallArray(msgbytes, [["u32"], ["u64"]]);
                    //     size[4] Rgetattr tag[2] valid[8] qid[13] mode[4] uid[4] gid[4] nlink[8]
                    //  rdev[8] size[8] blksize[8] blocks[8]
                    //  atime_sec[8] atime_nsec[8] mtime_sec[8] mtime_nsec[8]
                    //  ctime_sec[8] ctime_nsec[8] btime_sec[8] btime_nsec[8]
                    //  gen[8] data_version[8]
                    const mfid = fids[fid];
                    const st = await mfid.stat();


                    let nlink = BigInt(st.nlink);
                    if ((Number(st.mode) & S_IFMT) === S_IFDIR) {
                        if (nlink < 2n) nlink = 2n;
                    } else {
                        if (nlink < 1n) nlink = 1n;
                    }

                    // Inline: u64 + qid(u8+u32+u64=13) + 3*u32 + 16*u64 = 8 + 13 + 12 + 128 = 161 bytes
                    methodSpecific = new Uint8Array(161);
                    const statView = new DataView(methodSpecific.buffer);
                    statView.setBigUint64(0, requestMask, true);
                    // QID: type(u8) + version(u32) + path(u64) = 13 bytes at offset 8
                    statView.setUint8(8, mfid.type);
                    statView.setUint32(9, mfid.version, true);
                    statView.setBigUint64(13, mfid.path, true);
                    // mode, uid, gid
                    statView.setUint32(21, Number(st.mode), true);
                    statView.setUint32(25, Number(st.uid), true);
                    statView.setUint32(29, Number(st.gid), true);
                    // nlink, rdev, size, blksize, blocks
                    statView.setBigUint64(33, nlink, true);
                    statView.setBigUint64(41, 0n, true);
                    statView.setBigUint64(49, BigInt(st.size), true);
                    statView.setBigUint64(57, 8192n, true);
                    statView.setBigUint64(65, BigInt(st.size) / 8192n, true);
                    // atime_sec, atime_nsec, mtime_sec, mtime_nsec
                    statView.setBigUint64(73, BigInt(st.atimeMs) / 1000n, true);
                    statView.setBigUint64(81, BigInt(st.atimeMs * 1000), true);
                    statView.setBigUint64(89, BigInt(Math.floor(Number(st.mtimeMs))) / 1000n, true);
                    statView.setBigUint64(97, BigInt(st.mtimeMs * 1000), true);
                    // ctime_sec, ctime_nsec, btime_sec, btime_nsec
                    statView.setBigUint64(105, BigInt(0), true);
                    statView.setBigUint64(113, BigInt(0), true);
                    statView.setBigUint64(121, BigInt(st.birthtimeMs) / 1000n, true);
                    statView.setBigUint64(129, BigInt(st.birthtimeMs) * 1000n, true);
                    // gen, data_version
                    statView.setBigUint64(137, 0n, true);
                    statView.setBigUint64(145, 0n, true);
                    break;
                }
                case p9_msg_t.P9_TSETATTR: {
                    //     tag[2] fid[4] valid[4] mode[4] uid[4] gid[4] size[8]
                    //  atime_sec[8] atime_nsec[8] mtime_sec[8] mtime_nsec[8]
                    const [, [fid, valid, mode, uid, gid, size, atime_sec, , mtime_sec]] = UnmarshallArray(msgbytes, [
                        ["u32"], ["u32"], ["u32"], ["u32"], ["u32"], ["u64"], ["u64"], ["u64"], ["u64"], ["u64"]
                    ]);
                    const f = fids[fid];
                    if (valid & P9_SETATTR_MODE) {
                        await f.chmod(mode);
                    }
                    if ((valid & P9_SETATTR_UID) && (valid & P9_SETATTR_GID)) {
                        await f.chown(uid, gid);
                    }
                    let mtime = 0n, atime = 0n;
                    const now = BigInt(Date.now());
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
                    const [, [fid, offset, count]] = UnmarshallArray(msgbytes, [["u32"], ["u64"], ["u32"]]);
                    const f = fids[fid];
                    const buffer = new Uint8Array(count);
                    const numRead = await f.read(Number(offset), count, buffer);
                    methodSpecific = MarshallArray([
                        ["u32", numRead],
                        ['u8array', buffer.subarray(0, numRead)]
                    ]);
                    break;
                }
                case p9_msg_t.P9_TFSYNC: {
                    const [, [fid]] = UnmarshallArray(msgbytes, [["u32"], ["u32"]]);
                    const f = fids[fid];
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
                    const [, [dfid, fid, name]] = UnmarshallArray(msgbytes, [["u32"], ["u32"], ["sl"]]);
                    const parentFid = fids[dfid];
                    const refedFid = fids[fid];
                    await parentFid.link(name, refedFid.pathId);
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_TMKDIR: {
                    const [, [dfid, name, mode, gid]] = UnmarshallArray(msgbytes, [["u32"], ["sl"], ["u32"], ["u32"]]);
                    const parentFid = fids[dfid];
                    await parentFid.mkdir(name, mode, gid);
                    const newDirFid = await parentFid.walk(name);
                    methodSpecific = fmtQid(newDirFid.asQid());
                    break;
                }
                case p9_msg_t.P9_TRENAMEAT: {
                    //  olddirfid[4] oldname[s] newdirfid[4] newname[s]
                    const [, [olddirfid, oldname, newdirfid, nwname]] = UnmarshallArray(msgbytes, [["u32"], ["sl"], ["u32"], ["sl"]]);
                    const oldParent = fids[olddirfid];
                    const newParent = fids[newdirfid];
                    await oldParent.moveTo(oldname, newParent, nwname);
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_TUNLINKAT: {
                    // dirfd[4] name[s] flags[4]
                    const [, [dirfd, name]] = UnmarshallArray(msgbytes, [["u32"], ["sl"], ["u32"]]);

                    const d = fids[dirfd];
                    await d.unlink(name);
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_TVERSION: {
                    const [, [msizeu]] = UnmarshallArray(msgbytes, [["u32"], ["sl"]]);
                    msize = msizeu;
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
                    const [, [fid]] = UnmarshallArray(msgbytes, [["u32"], ["u32"], ["sl"], ["sl"], ["u32"]]);
                    if (!rootFileInfo) {
                        rootFileInfo = await router.root();
                    }
                    fids[fid] = rootFileInfo;
                    rootFileInfo.ref();
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
                    let [off, [fid, newfid, numNwname]] = UnmarshallArray(msgbytes, [["u32"], ["u32"], ["u16"]]);

                    let currentPath = fids[fid];
                    if (!currentPath) {
                        throw withErrno("EINVAL", "Invalid fid");
                    }

                    const walkedPaths: Qid[] = [];

                    if (numNwname === 0) {
                        fids[newfid] = currentPath;
                        currentPath.ref();
                        methodSpecific = MarshallArray([
                            ["u16", 0],
                            ["u8array", new Uint8Array(0)]
                        ]);
                        break;
                    }

                    for (let i = 0; i < numNwname; i++) {
                        const [newOff, [n]] = UnmarshallArray(msgbytes, [["sl"]], { byteOffset: off });
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
                        currentPath.ref();
                    }

                    const qidsData = new Uint8Array(walkedPaths.length * 13);
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
                    const [, [fid, offset, count]] = UnmarshallArray(msgbytes, [["u32"], ["u64"], ["u32"]]);

                    const f = fids[fid];

                    // Pre-allocate response buffer: size(4) + method(1) + tag(2) + numRead(4) + data(count)
                    const maxResponseSize = 4 + 1 + 2 + 4 + count;
                    const response = new Uint8Array(maxResponseSize);
                    const view = new DataView(response.buffer);

                    // Read directly into response buffer at offset 11
                    const numRead = await f.withMode(openModes[fid] ?? 0,
                        () => f.read(Number(offset), count, response.subarray(11)));

                    // Write header
                    const payloadSize = 4 + numRead;  // numRead field + data
                    const totalSize = 4 + 1 + 2 + payloadSize;
                    view.setUint32(0, totalSize, true);
                    view.setUint8(4, retMethod);
                    view.setUint16(5, tag, true);
                    view.setUint32(7, numRead, true);

                    respond(response.subarray(0, totalSize));
                    return;
                }
                case p9_msg_t.P9_RREAD: {
                    break;
                }
                case p9_msg_t.P9_TWRITE: {
                    const [, [fid, offset, count]] = UnmarshallArray(msgbytes, [["u32"], ["u64"], ["u32"]]);

                    // Read data directly from msgbytes without extra allocation
                    const dataView = msgbytes.subarray(16, 16 + count);
                    const f = fids[fid];
                    const r = await f.withMode(openModes[fid] ?? 0,
                        () => f.write(dataView, Number(offset)));

                    // Write response directly: size(4) + method(1) + tag(2) + bytesWritten(4)
                    const response = new Uint8Array(11);
                    const view = new DataView(response.buffer);
                    view.setUint32(0, 11, true);  // total size
                    view.setUint8(4, retMethod);
                    view.setUint16(5, tag, true);
                    view.setUint32(7, r.bytesWritten, true);

                    respond(response);
                    return;
                }
                case p9_msg_t.P9_RWRITE: {
                    break;
                }
                case p9_msg_t.P9_TCLUNK: {
                    const [, [fid]] = UnmarshallArray(msgbytes, [["u32"]]);
                    const f = fids[fid];
                    if (f) {
                        await f.clunk();
                        delete fids[fid];
                        delete openModes[fid];
                    }
                    methodSpecific = new Uint8Array();
                    break;
                }
                case p9_msg_t.P9_RCLUNK: {
                    break;
                }
                case p9_msg_t.P9_TREMOVE: {
                    const [, [fid]] = UnmarshallArray(msgbytes, [["u32"]]);
                    const f = fids[fid];
                    if (f) {
                        if (f.parentHandle) {
                            const basename = p.basename(f.pathId);
                            await f.parentHandle.unlink(basename);
                        } else {
                            // Root cannot be removed
                            throw withErrno("EACCES", "Cannot remove root directory");
                        }
                        await f.clunk();
                        delete fids[fid];
                        delete openModes[fid];
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
            
            const completeBuffer = new ArrayBuffer(1 + 2 + 4 + methodSpecific.length);
            const u8 = new Uint8Array(completeBuffer);
            u8.set(methodSpecific, 1 + 2 + 4);
            const dv = new DataView(completeBuffer);
            dv.setUint32(0, completeBuffer.byteLength, true);
            dv.setUint8(4, retMethod);
            dv.setUint16(5, tag, true);
            respond(u8);
            return;
        } catch (e) {
            console.error(e);
            if (e instanceof Exception) {
                const errNum = e.errno;
                const dat = MarshallArray([
                    ["u8", p9_msg_t.P9_RLERROR],
                    ["u16", tag],
                    ["u32", errNum]

                ]);
                const ret = MarshallArray([
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
    return (request: Uint8Array, respond: (response: Uint8Array) => void) =>
        router.run(() => p9handler(router.fs, request, respond));
}

export { getHandler };
