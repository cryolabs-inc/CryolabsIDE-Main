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
        let text = decoder.decode(this.buf, { stream: true });
        let delimIdx = text.indexOf(HEADER_DELIMITER);
        if (delimIdx === -1) {
            return -1;
        }
        let headerSection = text.substring(0, delimIdx);
        let contentLength = -1;
        for (let line of headerSection.split("\r\n")) {
            let match = line.match(/^Content-Length:\s*(\d+)$/i);
            if (match) {
                contentLength = parseInt(match[1], 10);
            }
        }
        if (contentLength < 0) {
            return -1;
        }
        let headerBytes = encoder.encode(headerSection + HEADER_DELIMITER).byteLength;
        let totalNeeded = headerBytes + contentLength;
        if (this.buf.byteLength < totalNeeded) {
            return -1;
        }
        let bodyBytes = this.buf.subarray(headerBytes, totalNeeded);
        let bodyStr = decoder.decode(bodyBytes);
        let message = JSON.parse(bodyStr) as Message;
        this._dispatchReceivedMessage(message);
        return totalNeeded;
    }

    async read_loop() {
        while (true) {
            let res = await this.readableStream.read();
            if (res.done) {
                this._onConnectionClosed();
                break;
            }
            let tmp_buf = res.value;
            let old_buf = this.buf;
            this.buf = new Uint8Array(old_buf.byteLength + tmp_buf.byteLength);
            this.buf.set(old_buf, 0);
            this.buf.set(tmp_buf, old_buf.byteLength);
            while (true) {
                let num_read = this.read_full_message();
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
        let body = JSON.stringify(message);
        let bodyBytes = encoder.encode(body);
        let header = `Content-Length: ${bodyBytes.byteLength}\r\n\r\n`;
        let headerBytes = encoder.encode(header);
        let packet = new Uint8Array(headerBytes.byteLength + bodyBytes.byteLength);
        packet.set(headerBytes, 0);
        packet.set(bodyBytes, headerBytes.byteLength);
        await this.writableStream.write(packet);
    }
}
export async function add_langs(pageAPI: PageAPI) {
    let extend = await pageAPI.ext;
    // await extend.openProcess("/bin/bash", [""]);
    // new monaco.lsp.MonacoLspClient(new CryolabsIDETransport())
}