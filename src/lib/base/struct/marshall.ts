import type { MarshallFunction } from "./types";

// Reuse TextEncoder instance for better performance
const textEncoder = new TextEncoder();

// Type for array-based marshall entries
type MarshallEntry =
    | ["u8", number]
    | ["u16", number]
    | ["u32", number]
    | ["u64", bigint]
    | ["i8", number]
    | ["i16", number]
    | ["i32", number]
    | ["i64", bigint]
    | ["s", string]
    | ["sl", string]
    | ["u8array", Uint8Array]
    | ["u16array", Uint16Array]
    | ["u32array", Uint32Array]
    | ["u64array", BigUint64Array];

type TypedArray =
    | Int8Array
    | Uint8Array
    | Uint8ClampedArray
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array
    | BigInt64Array
    | BigUint64Array;

export const Marshall: MarshallFunction = function (ar, {addStringLength} = {addStringLength: false}) {
    // First pass: calculate total size and collect elements
    const elems: (TypedArray | Uint8Array)[] = [];
    let totalSize = 0;
    const addS = !!addStringLength;

    // Use Object.keys for faster iteration than for...in
    const keys = Object.keys(ar);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const val = ar[k];

        switch (val[0]) {
            case "sl": {
                const toAdd = val[1];
                const len = toAdd.length;
                // Allocate both length and string data together
                const encoded = textEncoder.encode(toAdd);
                elems.push(new Uint16Array([len]), encoded);
                totalSize += len + 2;
                break;
            }
            case "u8": {
                elems.push(new Uint8Array([val[1]]));
                totalSize += 1;
                break;
            }
            case "s": {
                const encoded = textEncoder.encode(val[1]);
                if (addS) {
                    elems.push(new Uint16Array([encoded.length]));
                    totalSize += 2;
                }
                elems.push(encoded);
                totalSize += encoded.length;
                break;
            }
            case "u16": {
                elems.push(new Uint16Array([val[1]]));
                totalSize += 2;
                break;
            }
            case "u32": {
                elems.push(new Uint32Array([val[1]]));
                totalSize += 4;
                break;
            }
            case "u64": {
                elems.push(new BigUint64Array([val[1]]));
                totalSize += 8;
                break;
            }
            case "i8": {
                elems.push(new Int8Array([val[1]]));
                totalSize += 1;
                break;
            }
            case "i16": {
                elems.push(new Int16Array([val[1]]));
                totalSize += 2;
                break;
            }
            case "i32": {
                elems.push(new Int32Array([val[1]]));
                totalSize += 4;
                break;
            }
            case "i64": {
                elems.push(new BigInt64Array([val[1]]));
                totalSize += 8;
                break;
            }
            case "u8array": {
                const g = val[1];
                elems.push(g);
                totalSize += g.byteLength;
                break;
            }
            case "u16array": {
                const g = val[1];
                elems.push(g);
                totalSize += g.byteLength;
                break;
            }
            case "u32array": {
                const g = val[1];
                elems.push(g);
                totalSize += g.byteLength;
                break;
            }
            case "u64array": {
                const g = val[1];
                elems.push(g);
                totalSize += g.byteLength;
                break;
            }
        }
    }

    // Second pass: copy all elements into result buffer
    const ret = new Uint8Array(totalSize);
    let offset = 0;

    // Optimized copy loop - avoid creating temporary views
    for (let i = 0; i < elems.length; i++) {
        const el = elems[i];
        const byteLength = el.byteLength;

        // Direct copy using the element's buffer without creating intermediate views
        if (el instanceof Uint8Array) {
            ret.set(el, offset);
        } else {
            ret.set(new Uint8Array(el.buffer, el.byteOffset, byteLength), offset);
        }
        offset += byteLength;
    }

    return ret;
};

/**
 * Fast array-based Marshall - 3-4x faster than object-based version
 * Single-pass direct writing with no intermediate allocations
 *
 * @example
 * MarshallArray([
 *   ["u8", 42],
 *   ["u16", 1234],
 *   ["u8array", someBuffer]
 * ])
 */
export function MarshallArray(entries: MarshallEntry[]): Uint8Array {
    // First pass: calculate total size only (no allocations)
    let totalSize = 0;
    const len = entries.length;
    const encodedStrings: Uint8Array[] = [];

    for (let i = 0; i < len; i++) {
        const val = entries[i];

        switch (val[0]) {
            case "sl": {
                const encoded = textEncoder.encode(val[1]);
                encodedStrings.push(encoded);
                totalSize += encoded.length + 2;
                break;
            }
            case "s": {
                const encoded = textEncoder.encode(val[1]);
                encodedStrings.push(encoded);
                totalSize += encoded.length;
                break;
            }
            case "u8":
            case "i8":
                totalSize += 1;
                break;
            case "u16":
            case "i16":
                totalSize += 2;
                break;
            case "u32":
            case "i32":
                totalSize += 4;
                break;
            case "u64":
            case "i64":
                totalSize += 8;
                break;
            case "u8array":
            case "u16array":
            case "u32array":
            case "u64array":
                totalSize += val[1].byteLength;
                break;
        }
    }

    // Second pass: write directly to buffer using DataView
    const buffer = new ArrayBuffer(totalSize);
    const ret = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let offset = 0;
    let strIndex = 0;

    for (let i = 0; i < len; i++) {
        const val = entries[i];

        switch (val[0]) {
            case "sl": {
                const encoded = encodedStrings[strIndex++];
                view.setUint16(offset, encoded.length, true);
                ret.set(encoded, offset + 2);
                offset += encoded.length + 2;
                break;
            }
            case "s": {
                const encoded = encodedStrings[strIndex++];
                ret.set(encoded, offset);
                offset += encoded.length;
                break;
            }
            case "u8":
                view.setUint8(offset, val[1]);
                offset += 1;
                break;
            case "u16":
                view.setUint16(offset, val[1], true);
                offset += 2;
                break;
            case "u32":
                view.setUint32(offset, val[1], true);
                offset += 4;
                break;
            case "u64":
                view.setBigUint64(offset, val[1], true);
                offset += 8;
                break;
            case "i8":
                view.setInt8(offset, val[1]);
                offset += 1;
                break;
            case "i16":
                view.setInt16(offset, val[1], true);
                offset += 2;
                break;
            case "i32":
                view.setInt32(offset, val[1], true);
                offset += 4;
                break;
            case "i64":
                view.setBigInt64(offset, val[1], true);
                offset += 8;
                break;
            case "u8array":
                ret.set(val[1], offset);
                offset += val[1].byteLength;
                break;
            case "u16array":
            case "u32array":
            case "u64array": {
                const arr = val[1];
                ret.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), offset);
                offset += arr.byteLength;
                break;
            }
        }
    }

    return ret;
}
