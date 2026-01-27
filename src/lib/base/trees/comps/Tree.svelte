<script lang="ts" generics="T">
    import type { TreeDataProvider, TreeItem } from '../tree';

    let {val, tdp}: {val: T, tdp: TreeDataProvider<T>} = $props();
</script>
{#snippet ren(val: T)}
{#await tdp.getChildren(val)}
    <div>Loading item...</div>
{:then child} 
    {#if child.length > 0}
        <ul>
            {#each child as c}
                <li>
                    {@render ren(c)}
                    
                </li>

            {/each}

        </ul>
    {:else}
        <li>
            {#await tdp.getTreeItem(val)}
            <div>Loading i</div>
            {:then ti}
            <div>{ti.label}</div>
            {/await}
        </li>

    {/if}
{/await}
{/snippet}

{@render ren(val)}