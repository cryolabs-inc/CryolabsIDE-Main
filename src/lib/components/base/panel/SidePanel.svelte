<script lang="ts">
    import TooltipContent from "$lib/components/ui/tooltip/tooltip-content.svelte";
    import TooltipTrigger from "$lib/components/ui/tooltip/tooltip-trigger.svelte";
    import Tooltip from "$lib/components/ui/tooltip/tooltip.svelte";
    import type { Options } from "svelte-dnd-action";
    import DraggbleItemList from "../items/DraggbleItemList.svelte";
    import type { SidePanelItem } from "./SidePanelItem";
    
    let { items = $bindable(), selected=$bindable(""), dndZoneProps= {type: `fj-side-panel-${crypto.randomUUID()}`}}: { items: SidePanelItem<unknown>[], selected?: string, dndZoneProps?: Partial<Options<SidePanelItem<unknown>>> } = $props();
    let selectedItem = $derived(items.filter(v=>v.id===selected)[0]);
    
</script>

{#snippet SidePanelRenderer<T>(item: SidePanelItem<T>)}
    <div class="p-5">
    <Tooltip>
        <TooltipTrigger>
            <item.Icon></item.Icon>
        </TooltipTrigger>
        <TooltipContent>
            {item.tooltip}
        </TooltipContent>
    </Tooltip>
    </div>
{/snippet}
<div class="w-full h-full flex flex-row">
    <div class="bg-accent/50  ">
        <DraggbleItemList orientation="vertical" bind:items={items} Comp={SidePanelRenderer} bind:selected={selected} dndZoneProps={{...dndZoneProps}}></DraggbleItemList>
    </div>
    <div class="bg-accent/10 w-full p-4">
        {#if selectedItem}
            <selectedItem.panel></selectedItem.panel>
        {/if}
    </div>
</div>
