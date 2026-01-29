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
        let len = dataView.getUint16(byteOffset, littleEndian);
        let name = new TextDecoder().decode(u8.slice(byteOffset + 2, byteOffset + 2 + len));
        retObject[k] = name;
        byteOffset += 2 + len;
        break;
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
        retObject[k] = dataView.getBigUint64(byteOffset, littleEndian);
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
        let ret = u8.slice(byteOffset, byteOffset + vm[1]!);
        retObject[k] = ret;
        byteOffset += ret.byteLength;
        break;
      }
      case "u16array": {
        let byteLength = vm[1]! * 2;
        let sliced = u8.slice(byteOffset, byteOffset + byteLength);
        let ret = new Uint16Array(sliced.buffer, sliced.byteOffset, vm[1]!);
        retObject[k] = ret;
        byteOffset += byteLength;
        break;
      }
      case "u32array": {
        let byteLength = vm[1]! * 4;
        let sliced = u8.slice(byteOffset, byteOffset + byteLength);
        let ret = new Uint32Array(sliced.buffer, sliced.byteOffset, vm[1]!);
        retObject[k] = ret;
        byteOffset += byteLength;
        break;
      }
      case "u64array": {
        let byteLength = vm[1]! * 8;
        let sliced = u8.slice(byteOffset, byteOffset + byteLength);
        let ret = new BigUint64Array(sliced.buffer, sliced.byteOffset, vm[1]!);
        retObject[k] = ret;
        byteOffset += byteLength;
        break;
      }
    }
  }
  return [byteOffset, retObject as any];
};

