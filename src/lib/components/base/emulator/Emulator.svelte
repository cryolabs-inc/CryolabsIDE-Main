<script lang="ts">
    import { FileHandler, FileTreePanelHandler, getResourceManager, ResourceResponse, SimpleResourceHandler } from "$lib/base/resource";
    import { getAllContexts, onMount } from "svelte";
    import * as comlink from "comlink";
    import { Emitter } from "$lib/base/events";
    import type {
        ExtensionAPI,
        FSProviderAPI,
        WorkerHandlerAPI,
    } from "$lib/emulator/types";
    import type { TypedEvent } from "$lib/base/events/events";
    import { usePageAPI } from "../panel/apis/PageAPI";
    import path from "path";
    import TerminalView from "$lib/base/resource/viewers/TerminalView.svelte";
    import { getWM } from "../windows/WM";
    let { onResize, basePath}: { onResize: TypedEvent<void>, basePath: string} = $props();
    const resourceManager = getResourceManager();

    const papi = usePageAPI();
    class TerminalScheme extends SimpleResourceHandler {

        async doRetrpanel(request: Request): Promise<ResourceResponse> {
            let url = new URL(request.url);
            let termName = path.basename(url.pathname);
            if (!papi.getTerminal(termName)) {
                return ResourceResponse.notFound();
            }
            if (termName === "hvc") {
            }
            return ResourceResponse.ok<[typeof TerminalView]>("panel", {
                component: TerminalView,
                props: {
                    termId: termName,
                },
            });
        }
    }
    resourceManager.registerScheme("term", new TerminalScheme());
    let wm = getWM();
    onMount(async () => {
        let emulatorWorker = new Worker(
            new URL("../../../emulator/emulator_worker.ts", import.meta.url),
            { type: "module" },
        );
        let terminalEmitter = new Emitter<string>();

        let mainWorkerChannel = new MessageChannel();
        mainWorkerChannel.port1.start();
        await new Promise((resolve) => {
            emulatorWorker.onmessage = resolve;
        });
        emulatorWorker.postMessage({start: true, basePath}, [mainWorkerChannel.port2]);
        let api = comlink.wrap(mainWorkerChannel.port1) as WorkerHandlerAPI;
        let serialPort = new MessageChannel();
        serialPort.port1.onmessage = (e) => {
            let evt = e as MessageEvent<{ type: string; data: string }>;
            if (evt.data.type === "terminalData") {
                terminalEmitter.emit(evt.data.data);
            }
        };

        serialPort.port1.start();
        let fsChan = new MessageChannel();
        let extensionAPIChannel = new MessageChannel();
        await api.connect(
            comlink.transfer(
                {
                    fileSystemPort: fsChan.port2,
                    serialConsolePort: serialPort.port2,
                    extensionApi: extensionAPIChannel.port2,
                },
                [fsChan.port2, serialPort.port2, extensionAPIChannel.port2],
            ),
        );
        extensionAPIChannel.port1.start();
        let epapi = comlink.wrap(extensionAPIChannel.port1) as ExtensionAPI;

        let fs = comlink.wrap(fsChan.port1) as FSProviderAPI;
        resourceManager.registerScheme("file", new FileHandler(fs));
        resourceManager.registerScheme("file-tree", new FileTreePanelHandler(fs));
        papi.addTerminal("serial0", {
            textEv: terminalEmitter.event,
            onResizeNeeded: onResize,
            write(dat) {
                serialPort.port1.postMessage({ data: dat });
            },
        });

    papi.fsPromise.Resolve(fs);
        papi.openLink("term:///serial0", "tabs_lower");
        papi.emitAllLoaded();

    });
</script>
