/// <reference lib="WebWorker"/>

import type { Msg, WorkerMessageData } from "./types"
declare const self: SharedWorkerGlobalScope;
type SessionChildren = {
    port: MessagePort;
}
type SessionLeader = {
    lockName: string;
    port: MessagePort;
    children: SessionChildren[];
}
let sessionLeader: SessionLeader | undefined = undefined;
let reqId = 0;
self.onconnect = (e) => {
    const connectingPort = e.ports[0];

    connectingPort.start()
    connectingPort.addEventListener('message', (ev) => {
        const { data } = ev as Msg;
        switch (data.type) {
            case "LockAcquired":
                if (!sessionLeader) {
                    throw new Error("Locking while having no session leader.");
                }
                navigator.locks.request(sessionLeader.lockName,{"mode": "exclusive"}, ()=>{
                    console.debug('This is where we migrate session leaders and start a new worker in a child.');
                    sessionLeader = undefined;
                })
                break;
            case "GetWorkerPortRequest": {
                    const channel = new MessageChannel();

                
                
                if (!sessionLeader) {
                    // joined as session leader
                    const lockName = crypto.randomUUID();
                    // give'em a lock name
                    sessionLeader = { 
                        lockName,
                        children: [],
                        port: channel.port1
                    };
                    
                    // connecting port gets the sessionleader notification.
                    connectingPort.postMessage({
                        type: "GetWorkerPortResponse",
                        msgPort: channel.port2,
                        "mode": "sessionleader",
                        sessionLeaderLock: lockName
                    } as WorkerMessageData, [channel.port2]);
                }else {
                    // we are a session child.
                    sessionLeader.children.push({
                        port: channel.port1
                    });
                    
                    sessionLeader.port.postMessage({
                        "type": "GetWorkerPortRequest",
                        "id": reqId++
                    } as WorkerMessageData, [channel.port2]);
                    
                    connectingPort.postMessage({
                        type: "GetWorkerPortResponse",
                        msgPort: channel.port1,
                        mode: "sessionchild"
                    } as WorkerMessageData, [channel.port1]);
                }
                break;
            }
            case "GetWorkerPortResponse": {
                throw new Error("response to server.");
            }

        }
    });
}