<svelte:options runes/>
<script lang="ts">
    import ItemPanel from '$lib/components/base/items/DraggbleItemList.svelte';
    import { BookIcon, CircleQuestionMarkIcon } from '@lucide/svelte';

    import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';
    import TooltipTrigger from '$lib/components/ui/tooltip/tooltip-trigger.svelte';
    import Tooltip from '$lib/components/ui/tooltip/tooltip.svelte';
    import { type Component } from 'svelte';
    type PanelItem = {
        id: string,
        tooltip: string,
        Icon: Component,
        clickable: boolean
    };
    let items: PanelItem[] = [
        {
            id: "main-menu",
            Icon: BookIcon,
            clickable: true,
            tooltip: "Main menu"
        },
        {
            id: "help",
            Icon: CircleQuestionMarkIcon,
            clickable: true,
            tooltip: ""
        }
    ];
</script>

{#snippet ItemPanelItem(it: PanelItem)}
    <Tooltip>
        <TooltipTrigger>
            <it.Icon></it.Icon>
        </TooltipTrigger>
        <TooltipContent>
            {it.tooltip}
        </TooltipContent>
    </Tooltip>
{/snippet}
<div class="w-full h-full flex flex-row ">
    
    <div class="w-[50pt] h-full bg-gray ">
        <ItemPanel items={[...items]} Comp={ItemPanelItem} selected="main-menu"></ItemPanel>
    </div>
    <div class="w-[20%]  h-full bg-gray-700 ">

    </div>
    <div class="w-full  h-full bg-card">

    </div>

</div>