<svelte:options runes/>
<script lang="ts">
    import ItemPanel from '$lib/components/base/items/DraggbleItemList.svelte';
    import { BookIcon, CircleQuestionMarkIcon } from '@lucide/svelte';

    import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';
    import TooltipTrigger from '$lib/components/ui/tooltip/tooltip-trigger.svelte';
    import Tooltip from '$lib/components/ui/tooltip/tooltip.svelte';
    import { type Component } from 'svelte';
    import type { SidePanelItem } from '$lib/components/base/panel/SidePanelItem';
    import SidePanel from '$lib/components/base/panel/SidePanel.svelte';
    
    let items: SidePanelItem[] = [
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


<div class="w-full h-full flex flex-row ">
    
    <div class="w-[20%] h-full bg-gray ">
        <SidePanel {items}></SidePanel>
    </div>

    <div class="w-full  h-full bg-card">

    </div>

</div>