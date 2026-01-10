<script lang="ts" generics="T extends (Item & {id: string, clickable: boolean})">
    import { Emitter } from "$lib/base/events";

    import { setContext, type Component, type ComponentProps, type Snippet } from "svelte";
    import type { ItemGroupContext, SelectionKey } from ".";
    import { dndzone, type Item } from "svelte-dnd-action";
    import Button from "$lib/components/ui/button/button.svelte";
    import { twMerge, type ClassNameValue } from "tailwind-merge";
    let {items = $bindable(), Comp, selected = $bindable("")}: {items: T[], Comp: Snippet<[item: T]>, selected?: string} = $props();
    let hoverColor: ClassNameValue = "bg-foreground-500/50";
    let notHover: ClassNameValue = "bg-foreground-500/20";
    
</script>
<div class="h-full flex flex-col" >
    <div class={twMerge("flex flex-col h-full justify-start flex-1")} use:dndzone={{flipDurationMs: 20, items: items}} onfinalize={e=>{
        items = e.detail.items;
    }} onconsider={e=>{
        items = e.detail.items;
    }}>
        {#each items as it(it.id)}
        <div class={twMerge("cursor-grab py-5 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 flex items-center justify-center", selected===it.id&&"border-r-2 border-solid border-white")}>
        {@render Comp(it)}
        
        </div>
    {/each}
    </div>
    
</div>