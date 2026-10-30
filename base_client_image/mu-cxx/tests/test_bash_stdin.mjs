import { Duplex } from 'stream';
import {ConnectionClient} from '../t.js'
import * as net from 'net';
let sock = net.createConnection({
    host: "127.0.0.1",
    port: 8040,
}, async ()=>{
    let {readable, writable} = Duplex.toWeb(sock);
    let cli = new ConnectionClient(readable.getReader(), writable.getWriter());
    
    let bash_process = await cli.start_process("/bin/bash", ["-i"]);
    let t = new TextEncoder();
    (async()=>{
        while (true) {
            let c = await bash_process.stdout_stream.read();
            if (c.done){
                
                return;
            }
            process.stdout.write(c.value);
            
        }
    })();
    (async()=>{
        while (true) {
            let c = await bash_process.stderr_stream.read();
            if (c.done) {
                return;
            }
            process.stdout.write('\x1B[31m');
            process.stdout.write(c.value);
            process.stdout.write('\x1B[0m');

        }
    })()
    await bash_process.stdin_stream.write(t.encode("echo hi\n"));
    await bash_process.stdin_stream.write(t.encode("echo test\n"));
    await bash_process.stdin_stream.write(t.encode("sleep 0.4\n"));
    await bash_process.stdin_stream.write(t.encode("exit 2\n"));
    await bash_process.stdin_stream.close();
    setTimeout(async ()=>{
    console.log(await bash_process.wait());
        sock.end();
    }, 500);
})
