
// import { $from, struct, types as t } from "memium/decorators";

// class Inode extends $from(Uint8Array) {
//     st_dev = 0;
//     st_ino = 0;
//     constructor(dat: Partial<Inode>|Uint8Array) {
//         super();
        
//     }

// }

// export interface FSInterface {
//     super_mount(mnt: Mount, src: string, args: string[]): Promise<Mount>;    
// }

// export class Mount {
//     submounts: Mount[] = [];
//     fileSystemInterface?: FSInterface;
//     rootInode?: InodeOperations;
// }
// export class VFS_Inode {
// }
// class MemFSProvider implements FSInterface {
//     inode_ops = class MemoryInode implements InodeOperations {
        
//     };
//     async super_mount(mnt: Mount, src: string, args: string[]): Promise<Mount> {
//         return mnt;
//     }
    
// }
// export class VFS {
    
//     constructor() {
//         let rootMnt = new Mount();
        
//     }
// }