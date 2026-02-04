<svelte:options runes />

<script lang="ts">
    import { BookIcon, CircleQuestionMarkIcon, FileIcon, GitBranchIcon } from "@lucide/svelte";

    import { getAllContexts, onMount } from "svelte";
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
    import { ResourceManager, setResourceManager } from "$lib/base/resource";
    import { PageAPI, setPageAPI } from "../panel/apis/PageAPI";
    import {
        ResourceLinkContext,
        setResourceLinkCtx,
    } from "$lib/base/resourceCtx";
    import { Emitter } from "$lib/base/events";
    import FilePanel from "../panel/contents/FilePanel.svelte";
    import Emulator from "../emulator/Emulator.svelte";
    import { setWM, WM } from "../windows/WM";
    import StatusBar from "../statusbar/StatusBar.svelte";
    import Git from "../git/Git.svelte";
    import DialogContainer from "$lib/base/dialog/DialogContainer.svelte";

    let { basePath = "/", rootURL}: { basePath?: string, rootURL: string } = $props();

    class FullEditorPrefs {
        lowerTabsHeight: number = 20;
        upperTabsHeight: number = 80;
        stimulusWidth: number = 80;
        upperTabs: any = [];
        from(rec: Record<string, any> = {}) {
            if (rec["lowerTabsHeight"])
                this.lowerTabsHeight = rec["lowerTabsHeight"];
            if (rec["upperTabsHeight"])
                this.upperTabsHeight = rec["upperTabsHeight"];
            if (rec["stimulusWidth"]) this.stimulusWidth = rec["stimulusWidth"];
            if (rec["upperTabs"]) this.upperTabs = rec["upperTabs"];
        }
        async savePrefs() {
            await Prefs.default().store("full_editor.prefs", { ...this });
        }
    }
    let upperBrowser = $state<Browser>();
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
            panel: FilePanel,
        },
        {
            id: "git",
            Icon: GitBranchIcon,
            clickable: true,
            tooltip: "File",
            panel: Git
        }
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
    let resourceManager = new ResourceManager();
    let fullEditorPrefs = new FullEditorPrefs();

    ResourceManager.addDefaultSchemes(resourceManager);
    setResourceManager(resourceManager);
    let rc = new ResourceLinkContext();
    setResourceLinkCtx(rc);
    let diagContainer = $state<DialogContainer>();

    let papi = $derived(new PageAPI(rc, rootURL));
    setPageAPI(papi);
    let onResize = new Emitter<void>();
    let lowerTab = $state<ResizablePane>();
    let upperTab = $state<ResizablePane>();
    let stimulusPane = $state<ResizablePane>();
    let wm = new WM();
    wm.contexts = getAllContexts();
    setWM(wm);
    onMount(async () => {
        papi.dialogManager = diagContainer?.getManager()||null;
        if (!lowerTab || !upperTab || !stimulusPane) {
            return;
        }
        fullEditorPrefs.from(
            await Prefs.default().get("full_editor.prefs", {}),
        );

        lowerTab.resize(fullEditorPrefs.lowerTabsHeight);
        upperTab.resize(fullEditorPrefs.upperTabsHeight);
        stimulusPane.resize(fullEditorPrefs.stimulusWidth);
        let d = papi.onAllLoaded(() => {
            upperBrowser?.deserialize(fullEditorPrefs.upperTabs);
            upperBrowser?.onTabListChanged(() => {
                if (upperBrowser) {
                    fullEditorPrefs.upperTabs = upperBrowser.serialize();
                    fullEditorPrefs.savePrefs();
                }
            });
            d.dispose();
        });
    });
    console.log(papi);
    function newResizeHandler(val: (newSize: number) => void) {
        async function postResize(newSize: number) {
            onResize.emit();
            await fullEditorPrefs.savePrefs();
        }
        function rh(newSize: number) {
            val(newSize);
            postResize(newSize).then(() => {
                // tell user that prefs have bene saved.
            });
        }

        return rh;
    }
</script>

<div class="w-full h-full flex flex-col">
    <DialogContainer bind:this={diagContainer} />
    <div class="w-full h-full flex flex-row">
        <ResizablePaneGroup direction="horizontal">
            <ResizablePane minSize={20}>
                {#await updItems()}
                    <div></div>
                {:then}
                    <SidePanel bind:items={items!} selected="main-menu"
                    ></SidePanel>
                {:catch}
                    <div>error found</div>
                {/await}
            </ResizablePane>
            <ResizableHandle></ResizableHandle>
            <ResizablePane
                bind:this={stimulusPane}
                defaultSize={80}
                onResize={newResizeHandler((val) => {
                    fullEditorPrefs.stimulusWidth = val;
                })}
            >
                <ResizablePaneGroup direction="vertical">
                    <ResizablePane
                        bind:this={upperTab}
                        defaultSize={80}
                        onResize={newResizeHandler((ns) => {
                            fullEditorPrefs.upperTabsHeight = ns;
                        })}
                    >
                        <Browser bind:this={upperBrowser} target="upper"></Browser>
                    </ResizablePane>
                    <ResizableHandle></ResizableHandle>
                    <ResizablePane
                        bind:this={lowerTab}
                        defaultSize={20}
                        onResize={newResizeHandler((newSize) => {
                            fullEditorPrefs.lowerTabsHeight = newSize;
                        })}
                        minSize={20}
                        collapsible={true}
                    >
                        <Browser target="tabs_lower"></Browser>
                    </ResizablePane>
                </ResizablePaneGroup>
            </ResizablePane>
        </ResizablePaneGroup>

        <Emulator onResize={onResize.event} {basePath}></Emulator>
    </div>
    <div>
        <StatusBar></StatusBar>
    </div>
</div>
