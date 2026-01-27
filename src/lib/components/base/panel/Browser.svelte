<svelte:options runes />

<script lang="ts">
    import {
        defaultResourceFetch,
        getResourceManager,
        ResourceResponse,
    } from "$lib/base/resource";
    import { ResizablePane } from "$lib/components/ui/resizable";
    import ResizablePaneGroup from "$lib/components/ui/resizable/resizable-pane-group.svelte";
    import {
        Loader,
        Loader2Icon,
        PlusIcon,
        SearchIcon,
        TableOfContents,
        XCircleIcon,
        XIcon,
    } from "@lucide/svelte";
    import DraggbleItemList from "../items/DraggbleItemList.svelte";
    import ResizableHandle from "$lib/components/ui/resizable/resizable-handle.svelte";
    import { onMount } from "svelte";
    import { useResourceLinkCtx } from "$lib/base/resourceCtx";
    import path from "path";
    import type { TabItem } from "./TabbedPanelCtx";
    import { Spinner } from "$lib/components/ui/spinner";
    import { cn } from "$lib/utils";
    import { dndzone } from "svelte-dnd-action";
    let {
        target = "default",
        showTabs = true,
        showAddressBar = false,
        onNewTab
    }: {
        target?: string;
        showTabs?: boolean;
        showAddressBar?: boolean;
        onNewTab?: ()=>TabItem;
    } = $props();
    let items: TabItem[] = $state<TabItem[]>([]);
    let selectedTabItem = $state<string>("default");
    
    let seled = $derived.by<TabItem>(() => {
        if (items.length === 0) {
            return {
                id: "default",
                name: "Default tab",
                objectURL: "/robots.txt",
                clickable: true,
                state: "loading",
            };
        }
        return items.filter((v) => v.id === selectedTabItem)[0];
    });
    let extProm = new Promise<void>((resolve) => {
        onMount(resolve);
    });
    let rctx = useResourceLinkCtx();
    rctx.onLinkClicked(({ link, target: linkTarget }) => {
        if (!linkTarget.startsWith("_") && target !== linkTarget) {
            return;
        }
        if (linkTarget.startsWith("_") && target !== "default") {
            return;
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
        let newItem = {
            id: crypto.randomUUID(),
            name: ename,
            objectURL: link,
            clickable: true,
            state: "loading",
        } as TabItem;
        items.push(newItem);
        selectedTabItem = newItem.id;
    });
    let rm = getResourceManager();
    async function getPanel(tab: TabItem) {
        console.log(tab.objectURL);
        await extProm;
        tab.state = "loading";
        let resource = await rm.fetch(tab.objectURL, {
            method: "RETRPANEL",
        });
        tab.state = "complete";
        console.log(resource.resource);
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
</script>

{#snippet four04()}
    <div>This content was not found.</div>
{/snippet}
{#snippet Tab(tabItem: TabItem)}
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
{/snippet}
{#snippet TabContents(tabItem: TabItem)}
    {#await getPanel(tabItem)}
        <div></div>
    {:then s}
        {#if s?.Comp}
            <s.Comp {...s.props}></s.Comp>
        {/if}
        {#if s?.snip}
            {@render s.snip()}
        {/if}
    {/await}
{/snippet}
<div class="flex w-full h-full flex-col relative">
    <div class="h-fit flex flex-row">
        {#if showTabs}
            <DraggbleItemList
                bind:items
                Comp={Tab}
                orientation="horizontal"
                bind:selected={selectedTabItem}
                dndZoneProps={{ type: "tabs-upper" }}
            ></DraggbleItemList>
        {/if}

    </div>
    
    <diV class="flex flex-col w-full h-full overflow-hidden ">
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
