import SW from './shared_worker?sharedworker';
import E from './emulator_worker?worker';
import type { Msg, WorkerMessageData } from './types';
let singletonWorker: Worker|undefined = undefined;
export const getEmulatorPort = function (basePath: string) {
    return new Promise<MessagePort>((resolve) => {
        const s = new SW({
            name: "swa"
        });

        s.port.onmessage = async (e) => {
            const { data } = e as Msg;
            switch (data.type) {
                case 'GetWorkerPortRequest':
                    throw new Error("request to client");
                case 'GetWorkerPortResponse': {
                    if (data.mode === "sessionleader") {
                        const sessionLeaderLock = data.sessionLeaderLock!;
                        navigator.locks.request(sessionLeaderLock,{mode: "exclusive"} , () => {
                            return new Promise<void>((resolve) => {
                                // never resolve
                                
                            });
                        }).then(()=>{
                        });
                        data.msgPort.addEventListener('message', (e)=>{
                            if (e.data.type === "GetWorkerPortRequest") {
                                singletonWorker?.postMessage({start: false, basePath}, [e.ports[0]]);
                                data.msgPort.postMessage({"type": "GetWorkerPortResponse", id: e.data.id});
                                return;
                            }
                        })
                        data.msgPort.start();
                        setTimeout(()=>{
                            s.port.postMessage({
                            type: "LockAcquired"
                        } as WorkerMessageData);
                        })
                        // now we should worry about getting the worker port.
                        const wa = singletonWorker = new E();
                        await new Promise((resolve)=>{
                            wa.onmessage = resolve;
                        })
                        const mc = new MessageChannel();

                        wa.postMessage({start: true, basePath}, [mc.port1]);
                        resolve(mc.port2);
                    }
                    else {
                        resolve(data.msgPort);
                    }
                    break;
                }
                case 'LockAcquired': {
                    throw new Error("Request to client");
                }
            }
        }
        s.port.postMessage({
            type: "GetWorkerPortRequest"
        } as WorkerMessageData);
    });
}