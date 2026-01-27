<svelte:options runes />

<script lang="ts">
    import { BookIcon, CircleQuestionMarkIcon, FileIcon } from "@lucide/svelte";

    import { onMount } from "svelte";
    import type { SidePanelItem } from "$lib/components/base/panel/SidePanelItem";
    import SidePanel from "$lib/components/base/panel/SidePanel.svelte";
    import MainMenu from "$lib/components/base/panel/contents/MainMenu.svelte";
    import { Prefs } from "$lib/base/prefs";
    import Browser from "../panel/Browser.svelte";
    import {
        ResizablePane,
        ResizablePaneGroup,
    } from "$lib/components/ui/resizable";
    import ResizableHandle from "$lib/components/ui/resizable/resizable-handle.svelte";
    import type { ExtensionAPI, FSProviderAPI, WorkerHandlerAPI } from "$lib/emulator/types";
    import * as comlink from "comlink";
    import {
        FileHandler,
        ResourceManager,
        ResourceResponse,
        setResourceManager,
        SimpleResourceHandler,
    } from "$lib/base/resource";
    import { PageAPI, setPageAPI, usePageAPI } from "../panel/apis/PageAPI";
    import {
        ResourceLinkContext,
        setResourceLinkCtx,
    } from "$lib/base/resourceCtx";
    import path from "path";
    import TerminalView from "$lib/base/resource/viewers/TerminalView.svelte";
    import { Emitter } from "$lib/base/events";
    import FilePanel from "../panel/contents/FilePanel.svelte";
    import { ConstructExtendablePromise, type ExtendablePromise } from "$lib/utils";
    let defaultItems = [
        {
            id: "main-menu",
            Icon: BookIcon,
            clickable: true,
            tooltip: "Main menu",
            panel: MainMenu,
        },
        {
            id: "help",
            Icon: CircleQuestionMarkIcon,
            clickable: true,
            tooltip: "Help",
        },
        {
            id: "file",
            Icon: FileIcon,
            clickable: true,
            tooltip: "File",
            panel: FilePanel
        },
    ] as SidePanelItem<unknown>[];
    let items: SidePanelItem<unknown>[] | undefined = $state();
    async function updItems() {
        let p = await (
            await Prefs.default().getAsObjectPrefs()
        ).items.$asValue(defaultItems.map((v) => v.id));
        let it: SidePanelItem<unknown>[] = $state.snapshot(items)!;
        it = p.map((vi) => defaultItems.filter((v) => v.id === vi)[0])!;
        if (it.length !== defaultItems.length) {
            let vfa = defaultItems.filter((v) => !it.includes(v));
            it = it.concat(vfa);
        }
        items = it;
    }
    async function storeNewItems() {
        Prefs.default()
            .getAsObjectPrefs()
            .then((v) => {
                if (items) {
                    v.items.$store(items.map((v) => v.id));
                }
            });
    }
    $effect(() => {
        items;
        storeNewItems();
    });
    let rm = new ResourceManager();
    let ep = ConstructExtendablePromise();

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
                }
            });
        }
    }
    ResourceManager.addDefaultSchemes(rm);
    rm.registerScheme("term", new TerminalScheme());
    setResourceManager(rm);
    let rc = new ResourceLinkContext();
    setResourceLinkCtx(rc);
    let papi = new PageAPI(rc);
    setPageAPI(papi);
    let onResize = new Emitter<void>();
    onMount(async () => {
        let wx = new Worker(
            new URL("../../../emulator/emulator_worker.ts", import.meta.url),
            { type: "module" },
        );
        let em = new Emitter<string>();

        let pch = new MessageChannel();
        pch.port1.start();
        await new Promise((resolve) => {
            wx.onmessage = resolve;
        });
        wx.postMessage({}, [pch.port2]);
        let api = comlink.wrap(pch.port1) as WorkerHandlerAPI;
        let chan = new MessageChannel();
        chan.port1.onmessage = (e)=>{
            let evt = e as MessageEvent<{type: string, data: string}>;
            if (evt.data.type === "terminalData") {
                em.emit(evt.data.data);
            }
        }
        
        chan.port1.start();
        let fsChan = new MessageChannel();
        console.log(api);
        let extensionAPIChannel = new MessageChannel();
        
        await api.connect(
            comlink.transfer(
                {
                    fileSystemPort: fsChan.port2,
                    serialConsolePort: chan.port2,
                    extensionApi: extensionAPIChannel.port2
                },
                [fsChan.port2, chan.port2],
            ),
        );
        extensionAPIChannel.port1.start();
        let epapi= comlink.wrap(extensionAPIChannel.port1) as ExtensionAPI;
        epapi.openPtyToShell("", (dat)=>{
            
        }, ()=>{})
        let fs = comlink.wrap(fsChan.port1) as FSProviderAPI;
        rm.registerScheme("file", new FileHandler(fs));
        console.log(fs);
        papi.addTerminal("serial0", {
            textEv: em.event,
            onResizeNeeded: onResize.event,
            write(dat) {
                chan.port1.postMessage({data: dat});
            }
        });
        
        papi.openLink("term:///serial0", "tabs_lower");
    });
</script>

<div class="w-full h-full flex flex-row">
    <ResizablePaneGroup direction="horizontal">
        <ResizablePane minSize={20} onResize={e=>onResize.emit()}>
            {#await updItems()}
                <div></div>
            {:then}
                <SidePanel bind:items={items!} selected="main-menu"></SidePanel>
            {:catch}
                <div>error found</div>
            {/await}
        </ResizablePane>
        <ResizableHandle></ResizableHandle>
        <ResizablePane defaultSize={80}>
            <ResizablePaneGroup direction="vertical">
                <ResizablePane >
                    <Browser></Browser>
                </ResizablePane>
                <ResizableHandle></ResizableHandle>
                <ResizablePane defaultSize={20} onResize={()=>onResize.emit()} minSize={20} >
                    <Browser target="tabs_lower"></Browser>
                </ResizablePane>
            </ResizablePaneGroup>
        </ResizablePane>
    </ResizablePaneGroup>
</div>
