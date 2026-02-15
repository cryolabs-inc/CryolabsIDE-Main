import { Duplex } from "stream";
import { ConnectionClient } from "../t.js";
import * as net from 'net';
let conn =net.createConnection({
    host: "localhost",
    port: 8040
}, async()=>{
let {readable, writable} = Duplex.toWeb(conn);
let conn_client = new ConnectionClient(readable.getReader(), writable.getWriter());
let proc = await conn_client.start_process("/bin/bash");
let en = new TextEncoder();
proc.stdin_stream.write(en.encode("sleep 3000\n"));
setTimeout(async ()=>{
    console.log('killing process now.');
    let exit_code = await proc.kill();
    console.log('Exit code: ', exit_code);
    conn.end();

})
})