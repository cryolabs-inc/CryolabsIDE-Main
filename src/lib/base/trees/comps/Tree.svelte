<script lang="ts" generics="T">
    import Link from "$lib/components/base/resource/Link.svelte";
    import { CollapsibleContent } from "$lib/components/ui/collapsible";
    import CollapsibleTrigger from "$lib/components/ui/collapsible/collapsible-trigger.svelte";
    import Collapsible from "$lib/components/ui/collapsible/collapsible.svelte";
    import { cn } from "$lib/utils";
    import { ChevronDownIcon, ChevronUpIcon } from "@lucide/svelte";
    import { fade } from "svelte/transition";
    import type { TreeDataProvider, TreeItem } from "../tree";
    import {} from "svelte/transition";
    import ContextMenu from "$lib/components/ui/context-menu/context-menu.svelte";
    import ContextMenuTrigger from "$lib/components/ui/context-menu/context-menu-trigger.svelte";
    import { ContextMenuContent } from "$lib/components/ui/context-menu";
    import ContextMenuItem from "$lib/components/ui/context-menu/context-menu-item.svelte";
    import ContextMenuCheckboxItem from "$lib/components/ui/context-menu/context-menu-checkbox-item.svelte";
    import type { Snippet } from "svelte";
    let {
        val,
        tdp,
        version = $bindable(0),
        showHidden = $bindable(false),
        childrenContextMenuContent
    }: {
        val: T;
        tdp: TreeDataProvider<T>;
        version?: number;
        showHidden?: boolean;
        childrenContextMenuContent?: Snippet
    } = $props();

    export async function refresh() {
        version++;
    }
</script>
{#snippet childctxmenu(treeItem: TreeItem)}
    {#if childrenContextMenuContent}
        {@render childrenContextMenuContent()}
    {:else}
        {#each treeItem.actions as at}
            <ContextMenuItem onclick={e=>{
                at.callback(tdp, treeItem, e);
            }}>
            <div>
                {at.label}
                {#if at.icon}
                    <at.icon></at.icon>

                {/if}
            </div>
            </ContextMenuItem>
        {/each}
    {/if}

{/snippet}

{#snippet ren(
    val: T,
    depthPadding = 0,
    isRootElement: boolean = false,
    currentVersion: number,
)}
    {#key currentVersion}
        {#await tdp.getChildren(val)}
            <div>Loading item...</div>
        {:then child}
            <div
                style={`padding-left: ${depthPadding}px`}
                class="w-full"
                in:fade={{ duration: 200 }}
                out:fade={{ duration: 200, delay: 200 }}
            >
                {#if child && child.length > 0}
                    <Collapsible open={true} disabled={isRootElement}>
                        <CollapsibleTrigger class="w-full text-left group">
                            {#await tdp.getTreeItem(val)}
                                <div>Loading dirname</div>
                            {:then vm}
                                <div
                                    class={cn(
                                        " w-full flex flex-row justify-between",
                                        vm.isHidden && "text-foreground/20",
                                    )}
                                >
                                    {isRootElement ? tdp.rootLabel : vm.label}
                                    {#if !isRootElement}
                                        <div
                                            class="group-data-[state=open]:block hidden"
                                        >
                                            <ChevronUpIcon></ChevronUpIcon>
                                        </div>
                                        <div
                                            class="group-data-[state=closed]:block hidden"
                                        >
                                            <ChevronDownIcon></ChevronDownIcon>
                                        </div>
                                    {/if}
                                </div>
                            {/await}
                        </CollapsibleTrigger>
                        <CollapsibleContent
                            class="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden"
                        >
                            <ul>
                                {#each child as c (c)}
                                    <li>
                                        {@render ren(
                                            c,
                                            depthPadding + 20,
                                            false,
                                            currentVersion,
                                        )}
                                    </li>
                                {/each}
                            </ul>
                        </CollapsibleContent>
                    </Collapsible>
                {:else}
                    <li>
                        {#await tdp.getTreeItem(val)}
                            <div>Loading item</div>
                        {:then ti}
                            {#if showHidden || !ti.isHidden}
                            <ContextMenu>
                                <ContextMenuTrigger>
                                <div
                                    class={cn(
                                        ti.isHidden && "text-foreground/20",
                                    )}
                                >
                                    {#if !ti.link}
                                        <div>{ti.label}</div>
                                    {:else}
                                        <Link
                                            href={ti.link.href}
                                            target={ti.link.target}
                                        >
                                            {ti.label}
                                        </Link>
                                    {/if}
                                </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                    {@render childctxmenu(ti)}
                                </ContextMenuContent>
                            </ContextMenu>
                            {/if}
                        {/await}
                    </li>
                {/if}
            </div>
        {/await}
    {/key}
{/snippet}
<ContextMenu>
    <ContextMenuTrigger>
{@render ren(val, 0, true, version)}
</ContextMenuTrigger>
<ContextMenuContent>
    <ContextMenuCheckboxItem bind:checked={showHidden}>Show hidden tree entries...</ContextMenuCheckboxItem>
</ContextMenuContent>
</ContextMenu>