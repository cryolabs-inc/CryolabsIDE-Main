export class ConnectionClient {
    /**
     *
     * @param {ReadableStreamDefaultReader} readableStream
     * @param {WritableStreamDefaultWriter} writableStream
     */
    constructor(readableStream: ReadableStreamDefaultReader, writableStream: WritableStreamDefaultWriter);
    id: number;
    fids: number;
    nextFid(): number;
    /**
     * This the handler map that maps to unresolved promise callbacks.
     * @type {Map<number, (buf: Uint8Array)=>void>}
     */
    handler_map: Map<number, (buf: Uint8Array) => void>;
    nextId(): number;
    /**
     * Readable stream for the whole connection.
     * @type {ReadableStreamDefaultReader<Uint8Array>}
     */
    readable: ReadableStreamDefaultReader<Uint8Array>;
    /**
     * Writable stream for the whole connection
     * @type {WritableStreamDefaultWriter<Uint8Array>}
     */
    writable: WritableStreamDefaultWriter<Uint8Array>;
    /**
     * Stream map, i.e. contains the FID to stream related information. It serves as an abstraction.
     * @type {Map<number, {readable: ReadableStreamDefaultReader, writable: WritableStreamDefaultWriter}>}
     */
    stream_map: Map<number, {
        readable: ReadableStreamDefaultReader;
        writable: WritableStreamDefaultWriter;
    }>;
    /**
     * Writing stream maps. FID to writable stream.
    * @type {Map<number, {readable: ReadableStreamDefaultReader, writable: WritableStreamDefaultWriter}>}
    */
    stream_map_to: Map<number, {
        readable: ReadableStreamDefaultReader;
        writable: WritableStreamDefaultWriter;
    }>;
    /**
     * Gets the stream fucntion or
     * @param {number} fid
     * @returns {{readable: ReadableStreamDefaultReader<Uint8Array>, writable: WritableStreamDefaultWriter<Uint8Array>}}
     */
    get_stream(fid: number): {
        readable: ReadableStreamDefaultReader<Uint8Array>;
        writable: WritableStreamDefaultWriter<Uint8Array>;
    };
    /**
     * @param {Uint8Array} data
     */
    frame_msg_handler(data: Uint8Array): Promise<void>;
    /**
     *
     * @param {{readable: ReadableStreamDefaultReader<Uint8Array>, writable: WritableStreamDefaultWriter<Uint8Array>}} web_stream
     * @param {number} fid
    */
    start_read_loop_for(web_stream: {
        readable: ReadableStreamDefaultReader<Uint8Array>;
        writable: WritableStreamDefaultWriter<Uint8Array>;
    }, fid: number): Promise<void>;
    /**
     *
     * @param {number} fid
     *
     */
    get_to_stream(fid: number): Promise<{
        readable: ReadableStreamDefaultReader<Uint8Array>;
        writable: WritableStreamDefaultWriter<Uint8Array>;
    }>;
    /**
     * @type {Map<number, number>}
     */
    pid_exitcodes: Map<number, number>;
    /**
     * Pid waiters. Maps PID to callbacks waiting for pid results.
     * @type {Map<number, ((val: number)=>void)[]>}
     */
    pid_waiters: Map<number, ((val: number) => void)[]>;
    /**
     * Frame broadcast map: number to broadcast. currently unused
     * @type {Map<number, EventTarget>}
     */
    frame_broadcast: Map<number, EventTarget>;
    /**
     * Read message into IPC system.
     * @param {Uint8Array} buffer
     * @returns {Promise<number>}
     */
    read_message(buffer: Uint8Array): Promise<number>;
    /**
     * Read loop. Its not a busy loop since it waits for the read callback to return.
     */
    read_loop(): Promise<void>;
    /**
     * Send a raw message. it is not recommended to use this if you don't know how the IPC works.
     * @param {number} request_id Message Request Id
     * @param {number} method Method ID
     * @param {Uint8Array} payload
     * @returns {Promise<Uint8Array>} response
     */
    _send_msg(method: number, payload: Uint8Array, request_id?: number): Promise<Uint8Array>;
    /**
     * Kill a process. This will force kill and not send a SIGTERM.
     * @param {number} pfid Process FID
     * @returns {Promise<number>} Exit code
     */
    kill_process(pfid: number): Promise<number>;
    /**
     * Waiter fopr pfid
     * @param {number} pfid
     * @returns {((exit_code: number)=>void)[]}
     */
    get_waiter_entry(pfid: number): ((exit_code: number) => void)[];
    /**
     * Launch a program with access to a duplex PTY pipe. Useful for terminal emulators (i.e. XTerm)
     * @param {string} process_name
     * @param {string[]} process_launch_args
     *
     */
    start_process_pty(process_name: string, process_launch_args?: string[]): Promise<{
        pty_stream_reader: ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>>;
        pty_stream_writer: WritableStreamDefaultWriter<Uint8Array<ArrayBufferLike>>;
        kill: () => Promise<void>;
        wait: () => Promise<number>;
    }>;
    /**
     *  Launch a process with access to stdin/stdout/stderr seperately. Useful for programs like LSPs or binary.
     * @param {string} process_path Process name to launch
     * @param {string[]} process_launch_args Process arguments that it will launch with.
     */
    start_process(process_path: string, process_launch_args?: string[]): Promise<{
        stdout_stream: ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>>;
        stdin_stream: WritableStreamDefaultWriter<Uint8Array<ArrayBufferLike>>;
        stderr_stream: ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>>;
        kill: () => Promise<number>;
        wait: () => Promise<number>;
    }>;
}
