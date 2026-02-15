import { Duplex } from 'stream';
import {ConnectionClient} from '../connector.mjs'
import * as net from 'net';
let sock = net.createConnection({
    host: "localhost",
    port: 8040,
}, async ()=>{
    let {readable, writable} = Duplex.toWeb(sock);
    let cli = new ConnectionClient(readable.getReader(), writable.getWriter());
    let bash_process = await cli.start_process_pty("/bin/bash", ['-i']);
    let bash_process1 = await cli.start_process_pty("/bin/bash", ['-i']);
    let bash_process2 = await cli.start_process_pty("/bin/bash", ['-i']);
    let bash_process3 = await cli.start_process_pty("/bin/bash", ['-i']);
    let bash_process4 = await cli.start_process_pty("/bin/bash", ['-i']);
    let t = new TextEncoder();
    (async()=>{
        while (true) {
            let c = await bash_process.pty_stream_reader.read();
            if (c.done){
                sock.end();
                return;
            }
            process.stdout.write(new TextDecoder().decode(c.value));
            
        }
    })();
    await bash_process.pty_stream_writer.write(t.encode("ls\n"));
    await bash_process.pty_stream_writer.write(t.encode("exit 2;\n"));
    console.log("Exit code: ", await bash_process.wait());
})
