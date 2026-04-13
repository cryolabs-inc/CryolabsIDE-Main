import { Emitter } from "../base/events";
/**
 * 
 * @param {string[]} types Structure of data
 * @param {any[]} data 
 */
const Marshall = function (types: string[], data: any[], little_endian = false): [Uint8Array, number] {
    let buffer_size = 0;
    for (let i = 0; i < types.length; i++) {
        const dat = data[i];
        const type = types[i];
        switch (type) {
            case "s":
                buffer_size += (2 + dat.length);
                break;
            case "u32":
                buffer_size += 4;
                break;
            case "u8":
                buffer_size += 1;
                break;
            case "u16":
                buffer_size += 2;
                break;
            case "u64":
                buffer_size += 8;
                break;
            case "typed_array":
                buffer_size += dat.byteLength;
                break;
            case "f32":
                buffer_size += 4;
                break;
        }
    };
    const result = new Uint8Array(buffer_size);
    const dv = new DataView(result.buffer);
    let buffer_cursor = 0;
    const texten = new TextEncoder();
    for (let i = 0; i < types.length; i++) {
        const dat = data[i];
        const type = types[i];
        switch (type) {
            case "s": {
                dv.setUint16(buffer_cursor, dat.length, little_endian);
                buffer_cursor += 2;
                const encoded = texten.encode(dat);
                result.set(encoded, buffer_cursor);
                buffer_cursor += encoded.length;
                break;
            }
            case "u32": {
                dv.setUint32(buffer_cursor, dat, little_endian);
                buffer_cursor += 4;
                break;
            }
            case "u8": {
                dv.setUint8(buffer_cursor, dat);
                buffer_cursor += 1;
                break;
            }
            case "u16": {
                dv.setUint16(buffer_cursor, dat, little_endian);
                buffer_cursor += 2;
                break;
            }
            case "u64": {
                dv.setBigUint64(buffer_cursor, BigInt(dat), little_endian);
                buffer_cursor += 8;
                break;
            }
            case "typed_array": {
                const ua = new Uint8Array(dat.buffer, dat.byteOffset, dat.byteLength);
                result.set(ua, buffer_cursor);
                buffer_cursor += dat.byteLength;
                break;
            }
            case "f32": {
                dv.setFloat32(buffer_cursor, dat, little_endian);
                buffer_cursor += 4;
                break;
            }
        }
    }
    return [result, buffer_cursor];

}
function create_duplex_web_stream() {

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            controller.enqueue(chunk);
            
        }
    })
    return { readable, writable };
}
/**
 * 
 * @param {(string|Array<string>)[]} types 
 * @param {Uint8Array} buffer 
 */
const Unmarshall = function (types: string | Array<string | string[]>, buffer: Uint8Array, little_endian = false) {
    let buffer_cursor = 0;
    const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const textdec = new TextDecoder();
    const output = [];
    for (let i = 0; i < types.length; i++) {

        let t = types[i];
        let parameters = null;
        if (t instanceof Array) {
            parameters = /** @type {any[]} */t.slice(1);
            t = t[0];
        }


        switch (t) {
            case "s": {
                const string_length = dv.getUint16(buffer_cursor, little_endian);
                buffer_cursor += 2;
                output.push(textdec.decode(buffer.slice(buffer_cursor, buffer_cursor + string_length)));
                break;
            }
            case "u8": {
                output.push(dv.getUint8(buffer_cursor));
                buffer_cursor += 1;
                break;
            }
            case "u16": {
                output.push(dv.getUint16(buffer_cursor, little_endian));
                buffer_cursor += 2;
                break;
            }
            case "u32": {
                output.push(dv.getUint32(buffer_cursor, little_endian));
                buffer_cursor += 4;
                break;
            }
            case "u64": {
                buffer_cursor += 8;
                break;
            }
            case "typed_array": {
                if (!parameters) {
                    throw new Error("no parameters passed");
                }
                const data_len = (parameters[0]) as any;
                output.push(buffer.slice(buffer_cursor, buffer_cursor + data_len));
                buffer_cursor += data_len;
                break;
            }
            case "f32": {
                output.push(dv.getFloat32(buffer_cursor, little_endian));
                buffer_cursor += 4;
                break;
            }
        }
    }
    return output;

}
const ConnectionMethods = {
    Error: 0xFF,
    Illegal: 0xFE,
    StartProcess: 0,
    StartProcessResponse: 1,
    Frame: 2,
    KillProcess: 3,
    KillProcessResponse: 4,
    PipeClosed: 5,
    StartProcessPty: 6,
    StartProcessPtyResponse: 7,
    ResizePty: 8
}
type DuplexStreamPair = {
    readable: ReadableStream<Uint8Array>,
    writable: WritableStream<Uint8Array>
}
export class ConnectionClient {
    readable: ReadableStreamDefaultReader<Uint8Array>;
    writable: WritableStreamDefaultWriter<Uint8Array>;

    fid = 1;
    nextFid() {
        return this.fid++;
    }
    msg_id = 1; // 0 is reserved for frame notifications.
    nextMsgId() {
        return this.msg_id++;
    }

    /** Maps fid to streams for reading data FROM the remote (incoming frames). */
    stream_map: Map<number, { readable: ReadableStream<Uint8Array>, writer: WritableStreamDefaultWriter<Uint8Array> }> = new Map();

    /** Maps fid to acquired reader/writer pairs for writing data TO the remote. */
    stream_map_to: Map<number, { readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array> }> = new Map();

    handler_map: Map<number, (buffer: Uint8Array) => void> = new Map();
    pid_exitcodes: Map<number, number> = new Map();
    pid_waiters: Map<number, ((exit_code: number) => void)[]> = new Map();

    constructor(readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array>) {
        this.readable = readable.getReader();
        this.writable = writable.getWriter();
        this.read_loop();
    }

    /**
     * Gets or creates a duplex stream for receiving data from a given fid.
     * Incoming frames with this fid get written into the writable side;
     * consumers read from the readable side.
     */
    get_stream(fid: number): { readable: ReadableStream<Uint8Array>, writer: WritableStreamDefaultWriter<Uint8Array> } {
        let entry = this.stream_map.get(fid);
        if (!entry) {
            const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>(
                {},
                new CountQueuingStrategy({ highWaterMark: Infinity })
            );
            entry = { readable, writer: writable.getWriter() };
            this.stream_map.set(fid, entry);
        }
        return entry;
    }

    /**
     * Gets or creates a duplex stream for sending data to a given fid.
     * Consumers write into the writable side; a read loop forwards
     * chunks as Frame messages to the remote.
     */
    async get_to_stream(fid: number): Promise<DuplexStreamPair> {
        let entry = this.stream_map_to.get(fid);
        if (!entry) {
            const { readable, writable } = create_duplex_web_stream();
            entry = {
                readable: readable,
                writable: writable
            };
            this.stream_map_to.set(fid, entry);
            this.start_read_loop_for(readable, fid);
        }
        return entry;
    }

    /**
     * Reads from a local stream and forwards each chunk as a Frame message
     * to the remote side. Sends PipeClosed when the stream ends.
     */
    async start_read_loop_for(stream: ReadableStream, fid: number) {
        
        const rdr = stream.getReader();
        while (true) {
            const { done, value } = await rdr.read();
            if (done || !value) {
                break;
            }
            const [payload] = Marshall(["u32", "typed_array"], [fid, value]);
            this._send_msg(ConnectionMethods.Frame, payload, 0);
        }
        this._send_msg(ConnectionMethods.PipeClosed, Marshall(["u32"], [fid])[0], 0);
    }

    frame_msg_handler(data: Uint8Array) {
        console.log(new TextDecoder().decode(data));
        const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = dv.getUint32(0);
        const entry = this.get_stream(fid);
        entry.writer.write(data.subarray(4)).catch(() => {});
    }

    async read_loop() {
        let buf = new Uint8Array();
        while (true) {

            const { done, value } = await this.readable.read();
            if (done || !value) {
                break;
            }
            const temp_buf = value;
            const old_buf_length = buf.length;
            const old_buf = buf;

            buf = new Uint8Array(buf.length + temp_buf.length);
            buf.set(old_buf, 0);
            buf.set(temp_buf, old_buf_length);
            while (true) {
                const c = await this.read_message(buf);
                if (c === -1) {
                    break;
                }
                buf = buf.subarray(c);
            }
        }
    }

    async read_message(buffer: Uint8Array) {
        if (buffer.byteLength < 4) {
            return -1;
        }
        const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const msg_len = dv.getUint32(0);
        
        if (msg_len > buffer.byteLength) {
            return -1;
        }
        const msg_id = dv.getUint32(4);
        const msg_method = dv.getUint8(8);

        if (msg_id === 0) {
            if (msg_method === ConnectionMethods.Frame) {
                this.frame_msg_handler(buffer.subarray(9, msg_len));
                return msg_len;
            }
            if (msg_method === ConnectionMethods.KillProcessResponse) {
                const dv = new DataView(buffer.buffer, buffer.byteOffset + 9);
                const pid = dv.getUint32(0);
                console.log("KILLED PROCESS: ", pid);
                const exit_code = dv.getUint32(4);
                this.pid_exitcodes.set(pid, exit_code);
                let x;
                if (x = this.pid_waiters.get(pid)) {
                    x.forEach(v => v(exit_code));
                }
                this.pid_waiters.set(pid, []);
            }
            if (msg_method === ConnectionMethods.PipeClosed) {
                const dv = new DataView(buffer.slice(9).buffer);
                const fid = dv.getUint32(0);
                const entry = this.stream_map.get(fid);
                if (entry) { try { entry.writer.close(); } catch { } }
                this.stream_map.delete(fid);
                this.stream_map_to.delete(fid);
            }
        }
        const val = this.handler_map.get(msg_id);
        if (val)
            val(buffer.subarray(9, msg_len));

        return msg_len;
    }

    async _send_msg(method: number, payload: Uint8Array, request_id = this.nextMsgId()) {
        const total_length = 4 + 4 + 1 + payload.byteLength;
        const dv = new DataView(new ArrayBuffer(total_length));
        dv.setUint32(0, total_length);
        dv.setUint32(4, request_id);
        dv.setUint8(8, method);
        new Uint8Array(dv.buffer).set(payload, 9);
        if (request_id === 0) {
            await this.writable.write(new Uint8Array(dv.buffer));
            return new Uint8Array();
        }
        return new Promise<Uint8Array>(async (resolve, reject) => {
            this.handler_map.set(request_id, (ret_buf) => {
                this.handler_map.delete(request_id);
                resolve(ret_buf);
            });
            await this.writable.write(new Uint8Array(dv.buffer));
        });
    }

    get_waiter_entry(pfid: number) {
        if (!this.pid_waiters.has(pfid)) {
            const res = ([]) as ((exit_code: number) => void)[];
            this.pid_waiters.set(pfid, res);
            return res;
        };
        const res = this.pid_waiters.get(pfid);
        if (!res)
            throw new Error("unreachable");
        return res;
    }

    async kill_process(pfid: number) {
        const [payload] = Marshall(["u32"], [pfid]);
        const resp = await this._send_msg(ConnectionMethods.KillProcess, payload);
        const [exit_code] = Unmarshall(["u32"], resp);
        this.pid_exitcodes.set(pfid, (exit_code as number));
        return exit_code as number;
    }

    async start_process_pty(process_path: string, process_args: string[] = []) {
        const inTypes = ["s", "u32", ...process_args.map(_ => "s"), "u32", "u32"];
        const ptyFid = this.nextFid();
        const procFid = this.nextFid();
        const inData = [process_path, process_args.length, ...process_args, ptyFid, procFid];
        const [payload] = Marshall(inTypes, inData, false);
        const resp = await this._send_msg(ConnectionMethods.StartProcessPty, payload);

        const { readable } = this.get_stream(ptyFid);
        const { writable } = await this.get_to_stream(ptyFid);

        return {
            pty_stream_reader: readable,
            pty_stream_writer: writable,
            resize: async (cols: number, rows: number) => {
                const [payload] = Marshall(["u32", "u16", "u16"], [ptyFid, cols, rows]);
                this._send_msg(ConnectionMethods.ResizePty, payload, 0);
            },
            wait: async () => {
                return new Promise<number>((resolve) => {
                    if (this.pid_exitcodes.has(procFid)) {
                        resolve(this.pid_exitcodes.get(procFid)!);
                    }
                    else {
                        this.get_waiter_entry(procFid).push(resolve);
                    }
                });
            },
            kill: async () => {
                return this.kill_process(procFid);
            }
        }
    }

    async start_process(process_path: string, process_args: string[] = []) {
        const inTypes = ["s", "u32", ...process_args.map(_ => "s"), "u32", "u32", "u32", "u32"];
        const stdinFid = this.nextFid();
        const stderrFid = this.nextFid();
        const stdoutFid = this.nextFid();
        const procFid = this.nextFid();
        const inData = [process_path, process_args.length, ...process_args, stdinFid, stderrFid, stdoutFid, procFid];

        const [payload] = Marshall(inTypes, inData, false);
        await this._send_msg(ConnectionMethods.StartProcess, payload);

        const stdout_stream = this.get_stream(stdoutFid);
        const stderr_stream = this.get_stream(stderrFid);
        const stdin_stream = await this.get_to_stream(stdinFid);

        return {
            stdout_stream: stdout_stream.readable,
            stdin_stream: stdin_stream.writable,
            stderr_stream: stderr_stream.readable,
            kill: async () => {
                return await this.kill_process(procFid);
            },
            wait: async () => {
                return new Promise<number>((resolve) => {
                    if (this.pid_exitcodes.has(procFid)) {
                        resolve(this.pid_exitcodes.get(procFid)!);
                    }
                    this.get_waiter_entry(procFid).push(resolve);
                });
            }
        }
    }
}