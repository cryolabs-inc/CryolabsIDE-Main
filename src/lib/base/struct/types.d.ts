export interface StructDataMapOutput {
    "s": string;
    "sl": string;
    "u8": number;
    "u16": number;
    "u32": number;
    "u64": bigint;
    "i8": number;
    "i16": number;
    "i32": number;
    "i64": bigint;
    "u8array": Uint8Array;
    "u16array": Uint16Array;
    "u32array": Uint32Array;
    "u64array": BigUint64Array;
    
}
export type StructDataMapOutputT = {
    [K in keyof StructDataMapOutput]: StructDataMapOutput[K]
}[keyof StructDataMapOutput];
export type ExpectedArrayInputs = {

    "u8array": ["u8array", number];
    "u16array": ["u16array", number];
    "u32array": ["u32array", number];
    "u64array": ["u64array", number];
    "s": ["s", number];
};



export type StructDataMapInput = {
    [K in keyof StructDataMapOutput]: [K]
}[keyof StructDataMapOutput] | { [K in keyof ExpectedArrayInputs]: ExpectedArrayInputs[K] }[keyof ExpectedArrayInputs]
export type MarshallParams<T> = [T];

export type S = {
    [K in keyof StructDataMapOutput]: [K, StructDataMapOutput[K]]
}[keyof StructDataMapOutput];
export interface MarshallFunction {
    <T extends Record<any, S>>(arg: T, options?: {addStringLength?: boolean}): Uint8Array;
};
export interface UnmarshallFunction {
    <T extends Record<string, StructDataMapInput>>(buffer: Uint8Array, keys: T, arg?: {littleEndian?: boolean, byteOffset?: number}): [number, { [K in keyof T]: StructDataMapOutput[T[K][0]] }]

}