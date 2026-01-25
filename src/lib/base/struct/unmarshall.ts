import type { MarshallParams, StructDataMapOutput, StructDataMapInput, MarshallFunction, UnmarshallFunction, StructDataMapOutputT } from "./types";

export const Unmarshall: UnmarshallFunction = function (arrayBuffer, keys, arg = {}) {
  // Implementation
  let retObject: Record<string, StructDataMapOutputT> = {};
  let u8 = new Uint8Array(arrayBuffer);
  let dataView = new DataView(arrayBuffer.buffer);
  let { littleEndian = true, byteOffset = 0 } = arg;
  for (let k in keys) {
    let deltaOffset = 0;
    let vm = keys[k];
    let readSize = 0;
    switch (vm[0]) {
      case "sl": {
        let len = dataView.getUint16(byteOffset, true);
        let name = new TextDecoder().decode(u8.slice(byteOffset, byteOffset + len));
        retObject[k] = name;
        byteOffset += 2 + len;
      }
      case "s": {
        if (!vm[1]) {
          throw new Error("strings must have a length");
        }
        retObject[k] = new TextDecoder().decode(u8.slice(byteOffset, byteOffset + vm[1]!));
        byteOffset += vm[1]!
        break;
      }
      case "u8": {
        retObject[k] = u8[byteOffset];
        byteOffset += 1;
        break;
      }
      case "u16": {
        retObject[k] = dataView.getUint16(byteOffset, littleEndian);
        byteOffset += 2;
        break;
      }
      case "u32": {
        retObject[k] = dataView.getUint32(byteOffset, littleEndian);
        byteOffset += 4;
        break;
      }
      case "u64": {
        retObject[k] = dataView.getBigUint64(byteOffset, true);
        byteOffset += 8;
        break;
      }
      case "i8": {
        retObject[k] = dataView.getInt8(byteOffset);
        byteOffset += 1;
        break;
      }
      case "i16": {
        retObject[k] = dataView.getInt16(byteOffset, littleEndian);
        byteOffset += 2;
        break;
      }
      case "i32": {
        retObject[k] = dataView.getInt32(byteOffset, littleEndian);
        byteOffset += 4;
        break;
      }
      case "i64": {
        retObject[k] = dataView.getBigInt64(byteOffset, littleEndian);
        byteOffset += 8;
        break;
      }
      case "u8array": {
        let ret = new Uint8Array(u8.slice(byteOffset, byteOffset + vm[1]! * 1).buffer);
        retObject[k] = ret;
        byteOffset += ret.byteLength;
        break;
      }
      case "u16array": {
        let ret = new Uint16Array(u8.slice(byteOffset, byteOffset + vm[1]! * 2).buffer);
        retObject[k] = ret;
        byteOffset += ret.byteLength;
        break;
      }
      case "u32array": {
        let ret = new Uint32Array(u8.slice(byteOffset, byteOffset + vm[1]! * 4).buffer);
        retObject[k] = ret;
        byteOffset += ret.byteLength;
        break;
      }
      case "u64array": {
        let ret = new BigUint64Array(u8.slice(byteOffset, byteOffset + vm[1]! * 8).buffer);
        retObject[k] = ret;
        byteOffset += ret.byteLength;
        break;
      }
    }
  }
  return [byteOffset, retObject as any];
};

