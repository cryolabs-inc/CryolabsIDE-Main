/// @ts-check

// enum MultiplexerMethods {
//     Error = 0xFF,
//     Illegal = 0xFE,
//     StartProcess = 0, 
//     StartProcessResponse, // process ID (u32)
//     Frame = 2, // fd u32, ...rest frame pkt, no response.
//     KillProcess =3, // 
//     KillProcessResponse // May be recieved in response to a KIllProcess request or if the process itself dies

// }
/**
 * 
 * @param {string[]} types Structure of data
 * @param {any[]} data 
 */
const Marshall = function (types, data, little_endian = false) {
    let buffer_size = 0;
    for (let i = 0; i < types.length; i++) {
        let dat = data[i];
        let type = types[i];
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
    let result = new Uint8Array(buffer_size);
    let dv = new DataView(result.buffer);
    let buffer_cursor = 0;
    let texten = new TextEncoder();
    for (let i = 0; i < types.length; i++) {
        let dat = data[i];
        let type = types[i];
        switch (type) {
            case "s": {
                dv.setUint16(buffer_cursor, dat.length, little_endian);
                buffer_cursor += 2;
                let encoded = texten.encode(dat);
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
                let ua = new Uint8Array(dat.buffer, dat.byteOffset, dat.byteLength);
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

/**
 * 
 * @param {(string|Array<string>)[]} types 
 * @param {Uint8Array} buffer 
 */
const Unmarshall = function (types, buffer, little_endian = false) {
    let buffer_cursor = 0;
    let dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let textdec = new TextDecoder();
    let output = [];
    for (let i = 0; i < types.length; i++) {

        let t = types[i];
        let parameters = null;
        if (t instanceof Array) {
            parameters = /** @type {any[]} */t.slice(1);
            t = t[0];
        }


        switch (t) {
            case "s": {
                let string_length = dv.getUint16(buffer_cursor, little_endian);
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
                let data_len = /** @type {any} */ (parameters[0]);
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
// msg format: msg_size u32 request_id u32 method u8 
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
    StartProcessPtyResponse: 7
}

function create_duplex_web_stream() {
    /**
     * @type {TransformStream<Uint8Array, Uint8Array>}
     */
    let { readable, writable } = new TransformStream({
        transform(chunk, controller) {
            controller.enqueue(chunk);
        }
    })
    return { readable, writable };
}
export class ConnectionClient {
    id = 1;
    fids = 1;
    nextFid() {
        return this.fids++;
    }
    /**
     * This the handler map that maps to unresolved promise callbacks.
     * @type {Map<number, (buf: Uint8Array)=>void>}
     */
    handler_map = new Map()
    nextId() {
        return this.id++;
    }
    /**
     * Readable stream for the whole connection.
     * @type {ReadableStreamDefaultReader<Uint8Array>}
     */
    readable;

    /**
     * Writable stream for the whole connection
     * @type {WritableStreamDefaultWriter<Uint8Array>}
     */
    writable;


    /**
     * Stream map, i.e. contains the FID to stream related information. It serves as an abstraction.
     * @type {Map<number, {readable: ReadableStreamDefaultReader, writable: WritableStreamDefaultWriter}>}
     */
    stream_map = new Map();

    /**
     * Writing stream maps. FID to writable stream.
    * @type {Map<number, {readable: ReadableStreamDefaultReader, writable: WritableStreamDefaultWriter}>}
    */
    stream_map_to = new Map();
    /**
     * Gets the stream fucntion or 
     * @param {number} fid 
     * @returns {{readable: ReadableStreamDefaultReader<Uint8Array>, writable: WritableStreamDefaultWriter<Uint8Array>}}
     */
    get_stream(fid) {
        /**
        * @type {{readable: ReadableStreamDefaultReader<Uint8Array>, writable: WritableStreamDefaultWriter<Uint8Array>}|null}
        */
        let wstream = null;
        if (!this.stream_map.has(fid)) {
            let tmp  = create_duplex_web_stream();
            wstream =  {
                readable: tmp.readable.getReader(),
                writable: tmp.writable.getWriter()
            };
            this.stream_map.set(fid, wstream);
        }
        else {
            let tmp = this.stream_map.get(fid);
            if (!tmp) {
                throw new Error("unreachable");
            }
            wstream = tmp;
        }
        return wstream;
    }
    /**
     * @param {Uint8Array} data
     */
    async frame_msg_handler(data) {
        let dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let fid = dv.getUint16(0);
        const wstream = this.get_stream(fid);
        
        try {

            wstream.writable.write(data.subarray(2));
        } catch { }
    }
    /**
     * 
     * @param {ReadableStreamDefaultReader} readableStream
     * @param {WritableStreamDefaultWriter} writableStream
     */
    constructor(readableStream, writableStream) {
        this.readable = readableStream;
        this.writable = writableStream;
        this.read_loop();
    }
    /**
     * 
     * @param {{readable: ReadableStreamDefaultReader<Uint8Array>, writable: WritableStreamDefaultWriter<Uint8Array>}} web_stream 
     * @param {number} fid 
    */
    async start_read_loop_for(web_stream, fid) {
        while (true) {

            let val = await web_stream.readable.read();
            if (val.done) {
                break;
            }
            let [payload] = Marshall(["u32", "typed_array"],[fid, val.value]);
            this._send_msg(ConnectionMethods.Frame, /** @type {Uint8Array} */ (payload));
        }
        // connection closed.
        
        this._send_msg(ConnectionMethods.PipeClosed, /** @type {Uint8Array} */ (Marshall(["u32"], [fid])[0]));
    }
    /**
     * 
     * @param {number} fid 
     * 
     */
    async get_to_stream(fid) {
        /**
        * @type {{readable: ReadableStreamDefaultReader<Uint8Array>, writable: WritableStreamDefaultWriter<Uint8Array>}|null}
        */
        let wstream = null;
        if (!this.stream_map_to.has(fid)) {
            let tmp  = create_duplex_web_stream();
            wstream =  {
                readable: tmp.readable.getReader(),
                writable: tmp.writable.getWriter()
            };
            this.stream_map_to.set(fid,wstream);
this.start_read_loop_for(wstream,fid);
        }
        else {
            let tmp = this.stream_map_to.get(fid);
            if (!tmp) {
                throw new Error("unreachable");
            }
            wstream = tmp;
        }
        return wstream;
    }
    /**
     * @type {Map<number, number>}
     */
    pid_exitcodes = new Map();

    /**
     * Pid waiters. Maps PID to callbacks waiting for pid results.
     * @type {Map<number, ((val: number)=>void)[]>}
     */
    pid_waiters = new Map();

    /**
     * Frame broadcast map: number to broadcast. currently unused
     * @type {Map<number, EventTarget>}
     */
    frame_broadcast = new Map();
    /**
     * Read message into IPC system.
     * @param {Uint8Array} buffer 
     * @returns {Promise<number>}
     */
    async read_message(buffer) {
        if (buffer.byteLength < 4) {
            return -1;
        }
        let dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        let msg_len = dv.getUint32(0);

        if (msg_len > buffer.byteLength) {
            return -1;
        }
        let msg_id = dv.getUint32(4);
        let msg_method = dv.getUint8(8);

        if (msg_id === 0) {


            if (msg_method === ConnectionMethods.Frame) {
                this.frame_msg_handler(buffer.subarray(9, msg_len));
                return msg_len;
            }
            if (msg_method === ConnectionMethods.KillProcessResponse) {

                let dv = new DataView(buffer.buffer, buffer.byteOffset + 9);
                let pid = dv.getUint32(0);
                let exit_code = dv.getUint32(4);
                this.pid_exitcodes.set(pid, exit_code);
                let x;
                if ( x= this.pid_waiters.get(pid)) {
                    
                    x.forEach(v=>v(exit_code));
                }
            }
            if (msg_method === ConnectionMethods.PipeClosed) {
                let dv = new DataView(buffer.slice(9).buffer);
                let fid = dv.getUint32(0);
                
                this.stream_map.get(fid)?.writable?.close();
                this.stream_map.delete(fid);
                this.stream_map_to.delete(fid);

            }
        }
        let val = this.handler_map.get(msg_id);
        if (val)
            val(buffer.subarray(9, msg_len));

        return msg_len;
    }
    /**
     * Read loop. Its not a busy loop since it waits for the read callback to return.
     */
    async read_loop() {
        let buf = new Uint8Array();
        while (true) {
            let res = await this.readable.read();
            if (res.done) {
                break;
            }
            let temp_buf = res.value;
            let old_buf_length = buf.length;
            let old_buf = buf;

            buf = new Uint8Array(buf.length + temp_buf.length);
            buf.set(old_buf, 0);
            buf.set(temp_buf, old_buf_length);
            while (true) {
                let c = await this.read_message(buf);
                if (c === -1) {
                    break;
                }
                buf = buf.subarray(c);

            }
        }
    }
    /**
     * Send a raw message. it is not recommended to use this if you don't know how the IPC works.
     * @param {number} request_id Message Request Id
     * @param {number} method Method ID
     * @param {Uint8Array} payload 
     * @returns {Promise<Uint8Array>} response
     */
    async _send_msg(method, payload, request_id = this.nextId()) {
        let total_length = 4 + 4 + 1 + payload.byteLength;
        let dv = new DataView(new ArrayBuffer(total_length));
        dv.setUint32(0, total_length);
        dv.setUint32(4, request_id);
        dv.setUint8(8, method);
        new Uint8Array(dv.buffer).set(payload, 9);
        return new Promise(async (resolve, reject) => {
            this.handler_map.set(request_id, (ret_buf) => {
                this.handler_map.delete(request_id);
                resolve(ret_buf);
            });
            await this.writable.write(new Uint8Array(dv.buffer));
        })


    }
    /**
     * Kill a process. This will force kill and not send a SIGTERM.
     * @param {number} pfid Process FID
     * @returns {Promise<number>} Exit code
     */
    async kill_process(pfid) {

        let [payload] = Marshall(["u32"], [pfid]);
        let resp = await this._send_msg(ConnectionMethods.KillProcess, /** @type {Uint8Array} */ (payload));
        let [exit_code] = Unmarshall(["u32"], resp);
        this.pid_exitcodes.set(pfid, /** @type {number} */ (exit_code) );
        return /** @type {number} */ (exit_code);
    }
    /**
     * Waiter fopr pfid
     * @param {number} pfid 
     * @returns {((exit_code: number)=>void)[]}
     */
     get_waiter_entry(pfid) {
        if (!this.pid_waiters.has(pfid)) {
            let res = /** @type {((exit_code: number)=>void)[]} */ ([]);
            this.pid_waiters.set(pfid, res);
            return res;
        };
        let res =  this.pid_waiters.get(pfid);
        if (!res)
            throw new Error("unreachable");
        return res;
    }
    /**
     * Launch a program with access to a duplex PTY pipe. Useful for terminal emulators (i.e. XTerm)
     * @param {string} process_name 
     * @param {string[]} process_launch_args 
     * 
     */
    async start_process_pty(process_name, process_launch_args = []) {
        // pty fid, proc fid
        let typesIn = ["s", "u32", ...process_launch_args.map(_ => "s"), "u32", "u32"];
        let pty_fid = this.nextFid();
        let proc_fid = this.nextFid();
        let dataIn = [process_name, process_launch_args.length, ...process_launch_args, pty_fid, proc_fid];
        let [payload] = Marshall(typesIn, dataIn);
        let resp = await this._send_msg(ConnectionMethods.StartProcessPty, /** @type {Uint8Array} */(payload));
        let { readable } = this.get_stream(pty_fid);
        let {writable} = await this.get_to_stream(pty_fid);
        return {
            pty_stream_reader: readable,
            pty_stream_writer: writable,
            kill: async () => {
                await this.kill_process(proc_fid);
            },
            wait: 
            /**
             * 
             * @returns {Promise<number>}
             */
            async() => {
                return new Promise((resolve)=>{
                    if (this.pid_exitcodes.has(proc_fid)) {
                        let val = this.pid_exitcodes.get(proc_fid);
                        if (!val)
                            throw new Error("unreachable");
                        resolve(val);
                    }
                    this.get_waiter_entry(proc_fid).push(resolve);
                });
            }
        }
    }
    /**
     *  Launch a process with access to stdin/stdout/stderr seperately. Useful for programs like LSPs or binary.
     * @param {string} process_path Process name to launch
     * @param {string[]} process_launch_args Process arguments that it will launch with.
     */
    async start_process(process_path, process_launch_args = []) {
        // start process: pNameLen: u32; pName: str; numArgs: u32; args: Arguments where Arguments is {nameLen: u32; name: str} stdin fid stderr fid stdout fid
        let pname = process_path;
        let num_args = process_launch_args.length;
        let typesIn = ["s", "u32", ...process_launch_args.map(v => "s"), "u32", "u32", "u32", "u32"];
        let [stdinFd, stderrFd, stdoutFd, procFd] = [this.nextFid(), this.nextFid(), this.nextFid(), this.nextFid()];
        let dataIn = [pname, num_args, ...process_launch_args, stdinFd, stderrFd, stdoutFd, procFd];

        let [payload] = Marshall(typesIn, dataIn, false);
        await this._send_msg(ConnectionMethods.StartProcess, /** @type {Uint8Array} */(payload));
        let stdout_stream = this.get_stream(stdoutFd);
        let stderr_stream = this.get_stream(stderrFd);
        let stdin_stream = await this.get_to_stream(stdinFd);
        return {
            stdout_stream: stdout_stream.readable,
            stdin_stream: (stdin_stream).writable,
            stderr_stream: stderr_stream.readable,
            kill: async () => {
                return await this.kill_process(procFd);
            },
            wait: 
            /**
             * 
             * @returns {Promise<number>}
             */
            async()=>{
                
                return new Promise((resolve)=>{
                    if (this.pid_exitcodes.has(procFd)) {
                        let v= this.pid_exitcodes.get(procFd);
                        if (!v) {
                            throw new Error('unreachable')
                        }
                        resolve(v);
                    }
                    this.get_waiter_entry(procFd).push(resolve);
                });
            }
        }
    }
}
// let keepAliveConn = net.createConnection({
//     host: "127.0.0.1",
//     port: 8040
// }, async () => {
//     let { readable, writable } = stream.Duplex.toWeb(keepAliveConn);

//     let conn_client = new ConnectionClient(readable.getReader(), writable.getWriter());
//     let proc = await conn_client.start_process_pty("/bin/bash", ["-i"]);
//     let cnt = 0;
//     setTimeout(async ()=>{
//         await proc.pty_stream_writer.write(new TextEncoder().encode("ls\n"));
//        await new Promise((resolve)=>setTimeout(resolve, 500));
//         await proc.pty_stream_writer.write(new TextEncoder().encode("cat test.sh\n"));
//        await new Promise((resolve)=>setTimeout(resolve, 500));
//         await proc.pty_stream_writer.write(new TextEncoder().encode("echo \"echo its over\" > test.sh\n"));
//        await new Promise((resolve)=>setTimeout(resolve, 500));
//         await proc.pty_stream_writer.write(new TextEncoder().encode("exit 0;\n"));
        
//     },1000);
//     while (true) {
        
//         cnt++;
//         let v = await proc.pty_stream_reader.read();
//         if (v.done) {
//             break;
//         }

//         process.stdout.write(new TextDecoder().decode(v.value));
//     }
//     keepAliveConn.end()
// });