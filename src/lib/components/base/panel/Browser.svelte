<svelte:options runes />

<script lang="ts">
    import {
        getResourceManager,
    } from "$lib/base/resource";
    import {
        Loader2Icon,
        SearchIcon,
        XIcon,
    } from "@lucide/svelte";
    import DraggbleItemList from "../items/DraggbleItemList.svelte";
    import { onMount } from "svelte";
    import { useResourceLinkCtx } from "$lib/base/resourceCtx";
    import path from "path";
    import type { TabItem } from "./TabbedPanelCtx";
    import { ConstructExtendablePromise } from "$lib/utils";
    import ContextMenu from "$lib/components/ui/context-menu/context-menu.svelte";
    import ContextMenuTrigger from "$lib/components/ui/context-menu/context-menu-trigger.svelte";
    import ContextMenuContent from "$lib/components/ui/context-menu/context-menu-content.svelte";
    import ContextMenuItem from "$lib/components/ui/context-menu/context-menu-item.svelte";
    import { Emitter } from "$lib/base/events";
    let {
        target = crypto.randomUUID(),
        showTabs = true,
        showAddressBar = false,
        onNewTab,
        homepage = {
            "clickable": true,
            id: "default",
            name: "Default tab",
            objectURL: "about:blank",
            state: "loading",
        }
    }: {
        target?: string;
        showTabs?: boolean;
        showAddressBar?: boolean;
        onNewTab?: ()=>TabItem;
        homepage?: TabItem;
    } = $props();
    let items: TabItem[] = $state<TabItem[]>([]);
    let selectedTabItem = $state<string>("default");
    
    let seled = $derived.by<TabItem>(() => {
        if (items.length === 0) {
            return homepage;
        }
        return items.filter((v) => v.id === selectedTabItem)[0];
    });
    let activeTabsChanged = new Emitter<TabItem>();
    let tabListChanged = new Emitter<TabItem[]>();
    $effect(()=>{
        activeTabsChanged.emit(seled);
    });
    $effect(()=>{
        $state.snapshot(items);
        tabListChanged.emit(items);
    })
    
    let extProm = ConstructExtendablePromise();
    onMount(()=>{
        extProm.Resolve();
        return ()=>{

            activeTabsChanged.dispose();
            tabListChanged.dispose();
            items.forEach(v=>{
                v.closeEvent?.emit();
            })
        }
    })
    let rctx = useResourceLinkCtx();
    export function tab_open({ link, target: linkTarget = target }: {link: string, target?: string}, addANewOneEitherway: boolean = false)  {
        if (!linkTarget.startsWith("_") && target !== linkTarget && !addANewOneEitherway) {
            return;
        }
        if (linkTarget.startsWith("_") && target !== "default" && !addANewOneEitherway) {
            return;
        }
        if (target !== "_blank" && !addANewOneEitherway) {
            
        }
        let pname = new URL(link).pathname;
        let ename = path.basename(pname);
        if (linkTarget === "_self" && items.length > 0) {
            // just modify the current page.
            seled.name = ename;
            seled.objectURL = link;
            let seledIdx = items.findIndex((v) => v.id === selectedTabItem);
            items[seledIdx] = seled;
            return;
        }
        let closeEvent = new Emitter<void>();
        let newItem = {
            id: crypto.randomUUID(),
            name: ename,
            objectURL: link,
            clickable: true,
            state: "loading",
            closeEvent
        } as TabItem;
        items.push(newItem);
        selectedTabItem = newItem.id;
    }
    rctx.onLinkClicked(tab_open);
    let rm = getResourceManager();
    
    async function getPanel(tab: TabItem) {
        await extProm;
        tab.state = "loading";
        let resource = await rm.fetch(tab.objectURL, {
            method: "RETRPANEL",
        });
        tab.state = "complete";
        if (resource.resource && resource.resource.type === "panel") {
            return {
                Comp: resource.resource.data.component,
                props: resource.resource.data.props,
            };
        }
        if (resource.status === 404) {
            return {
                snip: four04,
            };
        }
        return null;
    }
    export const tabs = ()=>{
        return [...$state.snapshot(items)];
    }
    export const serialize = ()=>{
        return {
            it:  ($state.snapshot(items)).filter(v=>v.objectURL.startsWith('file:///')),
            seledId:selectedTabItem
        }
    }
    export const deserialize = (val: {it: TabItem[], seledId: string})=>{
        if (val instanceof Array) {
            items = val;
            return;
        }
        items = val.it;
        selectedTabItem = val.seledId;
        
    }
    
    export const onActiveTabChanged = activeTabsChanged.event;
    export const onTabListChanged = tabListChanged.event;
</script>

{#snippet four04()}
    <div>This content was not found.</div>
{/snippet}
{#snippet Tab(tabItem: TabItem)}
    <ContextMenu>
    <ContextMenuTrigger>
    <div class="  text-white p-2">
        <div class="flex justify-center gap-2">
            {tabItem.name}
            {#if tabItem.state === "loading"}
                <div class="animate-spin">
                    <Loader2Icon></Loader2Icon>
                </div>
            {/if}
            <button
                onclick={(e) => {
                    tabItem.closeEvent?.emit();
                    let idx = items.findIndex((v) => v.id === tabItem.id);
                    if (idx >= 0 && idx < items.length) {
                        // don't change
                    }
                    if (idx === items.length - 1) {
                        // change
                        idx--;
                    }

                    items = items.filter((v) => v.id !== tabItem.id);
                    if (selectedTabItem !== tabItem.id) {
                        // don't do anything.
                    } else {
                        // console.log("new sel: " + items[idx].id);
                    }
                    setTimeout(() => {
                        if (items.length === 0) {
                            return;
                        }
                        if (selectedTabItem !== tabItem.id) {
                            // don't do anything.
                            selectedTabItem = selectedTabItem;
                        }
                        selectedTabItem = items[idx].id;
                    });
                }}
            >
                <XIcon class="hover:text-red-400 rounded cursor-pointer"
                ></XIcon>
            </button>
        </div>
    </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
        <ContextMenuItem>Drag out to new window</ContextMenuItem>
    </ContextMenuContent>
    </ContextMenu>
{/snippet}
{#snippet TabContents(tabItem: TabItem)}
    {#await getPanel(tabItem)}
        <div></div>
    {:then s}
        {#if s?.Comp}
            <s.Comp onUnload={tabItem.closeEvent?.event} {...s.props}></s.Comp>
        {/if}
        {#if s?.snip}
            {@render s.snip()}
        {/if}
    {/await}
{/snippet}
<div class="flex w-full h-full flex-col relative">
    <div class="h-fit flex flex-row w-full">
        {#if showTabs}
            <DraggbleItemList
                bind:items
                Comp={Tab}
                orientation="horizontal"
                bind:selected={selectedTabItem}
                dndZoneProps={{ type: "tabs-upper" }}
                ondrop={e=>{
                    if (e.dataTransfer) {
                        let textData = e.dataTransfer.getData('text');
                        try {
                           let parsed =  JSON.parse(textData) as {type: "url", url: string};
                           if (parsed.type === "url") {
                            let u = new URL(parsed.url);
                            let fullURL = u.href;
                            tab_open({link: fullURL});                            
                           }
                        } catch {

                        }
                    }
                }}
            ></DraggbleItemList>
        {/if}

    </div>
    
    <diV class="flex flex-col w-full h-full overflow-scroll " style="scrollbar-width: none">
        {#if showAddressBar}
        <div class="w-full  h-full">
            <SearchIcon class="absolute"></SearchIcon>
            <input class="border-none w-full focus-visible:outline-red-400 absolute" type="text">
        </div>
        {/if}
        <div class="w-full  h-full ">
 {#if seled}
            {@render TabContents(seled)}
        {/if}
        </div>
    </diV>
</div>
