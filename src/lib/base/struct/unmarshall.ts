import type { MarshallParams, StructDataMapOutput, StructDataMapInput, MarshallFunction, UnmarshallFunction, StructDataMapOutputT } from "./types";

// Type for array-based unmarshall entries (mirrors MarshallEntry but for reading)
type UnmarshallEntry =
    | ["u8"]
    | ["u16"]
    | ["u32"]
    | ["u64"]
    | ["i8"]
    | ["i16"]
    | ["i32"]
    | ["i64"]
    | ["s", number]      // fixed-length string
    | ["sl"]             // length-prefixed string
    | ["u8array", number]
    | ["u16array", number]
    | ["u32array", number]
    | ["u64array", number];

type UnmarshallResult<T extends UnmarshallEntry> =
    T[0] extends "u8" | "u16" | "u32" | "i8" | "i16" | "i32" ? number :
    T[0] extends "u64" | "i64" ? bigint :
    T[0] extends "s" | "sl" ? string :
    T[0] extends "u8array" ? Uint8Array :
    T[0] extends "u16array" ? Uint16Array :
    T[0] extends "u32array" ? Uint32Array :
    T[0] extends "u64array" ? BigUint64Array :
    never;

/**
 * Fast array-based Unmarshall - mirrors MarshallArray but for reading
 * Single-pass direct reading with minimal overhead
 *
 * @example
 * const [offset, [type, version, path]] = UnmarshallArray(buffer, [
 *   ["u8"],
 *   ["u32"],
 *   ["u64"]
 * ]);
 */
export function UnmarshallArray<T extends UnmarshallEntry[]>(
    arrayBuffer: Uint8Array,
    entries: T,
    options: { littleEndian?: boolean; byteOffset?: number } = {}
): [number, { [K in keyof T]: UnmarshallResult<T[K]> }] {
    const u8 = arrayBuffer;
    const view = new DataView(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);
    const { littleEndian = true } = options;
    let offset = options.byteOffset ?? 0;

    const results: any[] = [];
    const len = entries.length;

    for (let i = 0; i < len; i++) {
        const entry = entries[i];

        switch (entry[0]) {
            case "u8":
                results.push(view.getUint8(offset));
                offset += 1;
                break;
            case "u16":
                results.push(view.getUint16(offset, littleEndian));
                offset += 2;
                break;
            case "u32":
                results.push(view.getUint32(offset, littleEndian));
                offset += 4;
                break;
            case "u64":
                results.push(view.getBigUint64(offset, littleEndian));
                offset += 8;
                break;
            case "i8":
                results.push(view.getInt8(offset));
                offset += 1;
                break;
            case "i16":
                results.push(view.getInt16(offset, littleEndian));
                offset += 2;
                break;
            case "i32":
                results.push(view.getInt32(offset, littleEndian));
                offset += 4;
                break;
            case "i64":
                results.push(view.getBigInt64(offset, littleEndian));
                offset += 8;
                break;
            case "sl": {
                const strLen = view.getUint16(offset, littleEndian);
                const str = new TextDecoder().decode(u8.subarray(offset + 2, offset + 2 + strLen));
                results.push(str);
                offset += 2 + strLen;
                break;
            }
            case "s": {
                const strLen = entry[1];
                const str = new TextDecoder().decode(u8.subarray(offset, offset + strLen));
                results.push(str);
                offset += strLen;
                break;
            }
            case "u8array": {
                const arrLen = entry[1];
                results.push(u8.slice(offset, offset + arrLen));
                offset += arrLen;
                break;
            }
            case "u16array": {
                const count = entry[1];
                const byteLen = count * 2;
                const sliced = u8.slice(offset, offset + byteLen);
                results.push(new Uint16Array(sliced.buffer, sliced.byteOffset, count));
                offset += byteLen;
                break;
            }
            case "u32array": {
                const count = entry[1];
                const byteLen = count * 4;
                const sliced = u8.slice(offset, offset + byteLen);
                results.push(new Uint32Array(sliced.buffer, sliced.byteOffset, count));
                offset += byteLen;
                break;
            }
            case "u64array": {
                const count = entry[1];
                const byteLen = count * 8;
                const sliced = u8.slice(offset, offset + byteLen);
                results.push(new BigUint64Array(sliced.buffer, sliced.byteOffset, count));
                offset += byteLen;
                break;
            }
        }
    }

    return [offset, results as any];
}

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

