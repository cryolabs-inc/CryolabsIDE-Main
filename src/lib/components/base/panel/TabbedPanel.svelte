<svelte:options runes/>
<script lang="ts">
    import { resourceFetch, ResourceResponse } from '$lib/base/resource';
    import { ResizablePane } from '$lib/components/ui/resizable';
    import ResizablePaneGroup from '$lib/components/ui/resizable/resizable-pane-group.svelte';
    import { TableOfContents } from '@lucide/svelte';
    import DraggbleItemList from '../items/DraggbleItemList.svelte';
    import ResizableHandle from '$lib/components/ui/resizable/resizable-handle.svelte';

    interface TabItem {
        id: string;
        name: string;
        objectURL: string;
        clickable: boolean;
    };
    let items: TabItem[] = $state<TabItem[]>([{
        id: "a",
        name: "Default tab",
        objectURL: "/robots.txt",
        clickable: true
    }]);
    let selectedTabItem = $state<string>("a");
    let seled = $derived<TabItem>(items.filter(v=>v.id===selectedTabItem)[0]);
    async function getPanel(tab: TabItem) {
        console.log(tab.objectURL);
        let resource = await resourceFetch(tab.objectURL, {method: "RETRPANEL"});
        console.log(resource.resource);
        if (resource.resource && resource.resource.type === "panel") {
            return {
                Comp: resource.resource.data.component,
                props: resource.resource.data.props
            };
        }
        return null;
    };
</script>
{#snippet Tab(tabItem: TabItem)}
    <div class="  text-white py-2">
        <div>
        {tabItem.name}

        </div>
    </div>

{/snippet}
{#snippet TabContents(tabItem: TabItem)}
    {#await getPanel(tabItem)}
        <div>Loading panel...</div>
        {:then s}
            {#if s}
                <s.Comp {...s.props}></s.Comp>

            {/if}
        
    {/await}
{/snippet}
<div    class="flex w-full h-full flex-col">
    <div class="h-fit">
    <DraggbleItemList bind:items={items} Comp={Tab} orientation="horizontal" bind:selected={selectedTabItem} dndZoneProps={{type: "tabs-upper"}}></DraggbleItemList>
    </div>
    
    <div class="h-full bg-background/50">
        {#if seled}
            {@render TabContents(seled)}

        {/if}
    </div>
</div>