import type { MarshallFunction } from "./types";
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
    // Implementation
    let elems = [] as TypedArray[];
    
    let totalSize = 0;
    let addS = !!addStringLength;
    let texten = new TextEncoder();
    for (let k in ar) {
        let val = ar[k];
        switch (val[0]) {
            case "sl":{
                let [,toAdd] = val;
                elems.push(new Uint16Array([toAdd.length]));
                elems.push(texten.encode(toAdd));
                break;
            }
            case "u8": {
                elems.push(new Uint8Array([val[1]]));
                totalSize += 1;
                break;
            }
            case "s": {
                let mf = new TextEncoder().encode(val[1]);
                if (addS) {
                    elems.push(new Uint16Array([mf.length]));
                }
                elems.push(mf.slice());
                totalSize += mf.length;
                break;
            }
            case "u16": {
                let g = val[1];
                elems.push(new Uint16Array([g]));
                totalSize += Uint16Array.BYTES_PER_ELEMENT;
                break;
            }
            case "u32": {
                let g = val[1];
                elems.push(new Uint32Array([g]));
                totalSize += Uint32Array.BYTES_PER_ELEMENT;
                break;
            }
            case "u64": {
                let g = val[1];
                elems.push(new BigUint64Array([g]));
                totalSize += BigUint64Array.BYTES_PER_ELEMENT;
                break;
            }
            case "i8": {
                let g = val[1];
                elems.push(new Int8Array([g]));
                totalSize += 1;
                break;
            }
            case "i16": {
                let g = val[1];
                elems.push(new Int16Array([g]));
                totalSize += 2;
                break;
            }
            case "i32": {
                let g = val[1];
                elems.push(new Int32Array([g]));
                totalSize += 4;
                break;
            }
            case "i64": {
                let g = val[1];
                elems.push(new BigInt64Array([g]));
                totalSize += 8;
                break;
            }
            case "u8array": {
                let g = val[1];
                elems.push(g);
                totalSize+=g.byteLength;
                break;
            }
            case "u16array": {
                let g = val[1];
                elems.push(g);
                totalSize += g.byteLength;
                break;
            }
            case "u32array": {
                let g = val[1];
                elems.push(g);
                totalSize+=g.byteLength;
                break;
            }
            case "u64array": {
                let g = val[1];
                elems.push(g);
                totalSize+=g.byteLength;
                break;
            }
        }
    }

    let ab = new ArrayBuffer(totalSize);
    let ret = new Uint8Array(ab);
    let offset = 0;
    for (let el of elems) {
        ret.set(new Uint8Array(el.buffer), offset);
        offset += el.byteLength;
    }

    return ret;
};
Marshall({
    x: ["u8", 2],
    "f d": ["u64", 2n]
});
