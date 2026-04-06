import * as monaco from 'monaco-editor';
import {BaseMessageTransport, type Message} from '@hediet/json-rpc';
import type { PageAPI } from '$lib/components/base/panel/apis/PageAPI';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HEADER_DELIMITER = "\r\n\r\n";

export class CryolabsIDETransport extends BaseMessageTransport {
    readableStream: ReadableStreamDefaultReader<Uint8Array>;
    writableStream: WritableStreamDefaultWriter<Uint8Array>;
    buf = new Uint8Array();

    constructor(readableStream: ReadableStream<Uint8Array>, writableStream: WritableStream<Uint8Array>) {
        super();
        this.readableStream = readableStream.getReader();
        this.writableStream = writableStream.getWriter();
        this.read_loop();
    }

    /**
     * Tries to parse one full LSP message from `this.buf`.
     * Returns the number of bytes consumed, or -1 if incomplete.
     */
    read_full_message(): number {
        const text = decoder.decode(this.buf, { stream: true });
        const delimIdx = text.indexOf(HEADER_DELIMITER);
        if (delimIdx === -1) {
            return -1;
        }
        const headerSection = text.substring(0, delimIdx);
        let contentLength = -1;
        for (const line of headerSection.split("\r\n")) {
            const match = line.match(/^Content-Length:\s*(\d+)$/i);
            if (match) {
                contentLength = parseInt(match[1], 10);
            }
        }
        if (contentLength < 0) {
            return -1;
        }
        const headerBytes = encoder.encode(headerSection + HEADER_DELIMITER).byteLength;
        const totalNeeded = headerBytes + contentLength;
        if (this.buf.byteLength < totalNeeded) {
            return -1;
        }
        const bodyBytes = this.buf.subarray(headerBytes, totalNeeded);
        const bodyStr = decoder.decode(bodyBytes);
        const message = JSON.parse(bodyStr) as Message;
        this._dispatchReceivedMessage(message);
        return totalNeeded;
    }

    async read_loop() {
        while (true) {
            const res = await this.readableStream.read();
            if (res.done) {
                this._onConnectionClosed();
                break;
            }
            const tmp_buf = res.value;
            const old_buf = this.buf;
            this.buf = new Uint8Array(old_buf.byteLength + tmp_buf.byteLength);
            this.buf.set(old_buf, 0);
            this.buf.set(tmp_buf, old_buf.byteLength);
            while (true) {
                const num_read = this.read_full_message();
                if (num_read < 0) {
                    break;
                }
                this.buf = this.buf.subarray(num_read);
            }
        }
    }

    toString(): string {
        return "CryolabsIDE message transport";
    }

    protected async _sendImpl(message: Message): Promise<void> {
        const body = JSON.stringify(message);
        const bodyBytes = encoder.encode(body);
        const header = `Content-Length: ${bodyBytes.byteLength}\r\n\r\n`;
        const headerBytes = encoder.encode(header);
        const packet = new Uint8Array(headerBytes.byteLength + bodyBytes.byteLength);
        packet.set(headerBytes, 0);
        packet.set(bodyBytes, headerBytes.byteLength);
        await this.writableStream.write(packet);
    }
}
export async function add_langs(pageAPI: PageAPI) {
    // const extend = await pageAPI.ext;
    // const clangd = await extend.openProcess("/usr/bin/clangd", ["--background-index"]);
    // const streams = await clangd.streams();
    // const transport = new CryolabsIDETransport(streams.stdout, streams.stdin);
    // const cli = new monaco.lsp.MonacoLspClient(transport);
    
}