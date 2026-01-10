<svelte:options runes />

<script lang="ts">
    import ItemPanel from "$lib/components/base/items/DraggbleItemList.svelte";
    import { BookIcon, CircleQuestionMarkIcon } from "@lucide/svelte";

    import TooltipContent from "$lib/components/ui/tooltip/tooltip-content.svelte";
    import TooltipTrigger from "$lib/components/ui/tooltip/tooltip-trigger.svelte";
    import Tooltip from "$lib/components/ui/tooltip/tooltip.svelte";
    import { onMount, type Component } from "svelte";
    import type { SidePanelItem } from "$lib/components/base/panel/SidePanelItem";
    import SidePanel from "$lib/components/base/panel/SidePanel.svelte";
    import MainMenu from "$lib/components/base/panel/contents/MainMenu.svelte";
    import localforage from "localforage";
    import { Prefs } from "$lib/base/prefs";

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
    ] as SidePanelItem<unknown>[];
    let items: SidePanelItem<unknown>[] | undefined = $state();
    async function updItems() {
        let p = await (
            await Prefs.default().getAsObjectPrefs()
        ).items.$asValue(defaultItems.map((v) => v.id));

        items = p.map((vi) => defaultItems.filter((v) => v.id === vi)[0])!;
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
        $state.snapshot(items);
        
        storeNewItems();
    });
</script>

<div class="w-full h-full flex flex-row">
    <div class="w-[20%] h-full bg-gray">
        {#await updItems()}
            <div></div>
        {:then}
            <SidePanel bind:items={items!} selected="main-menu"></SidePanel>
        {:catch}
            <div>error found</div>
        {/await}
    </div>

    <div class="w-full h-full bg-card"></div>
</div>
