<script lang="ts">
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import { type FSProviderAPI } from "$lib/emulator/types";
    import { onMount } from "svelte";
    import { FileEntry, FT } from "./file";
    import FileTreeItem from "./FileTreeItem.svelte";
    let { rootDir, target = "_blank" }: { rootDir: string, target?: string } = $props();
    console.log(target);
    let fileAPI = $state<FSProviderAPI>();
    let papi = usePageAPI();
    let rootFileEntry = $derived(new FileEntry(rootDir, "directory", papi, true, target));
    
    let treeDataProvider = $derived<FT | undefined>(
        fileAPI && new FT(fileAPI, papi, rootFileEntry, target),
    );
    onMount(()=>{
        (async()=>{
            fileAPI = await papi.fs;
        })()
    });
</script>

{#if treeDataProvider}
    <FileTreeItem
        ftreeItem={rootFileEntry}
        tdp={treeDataProvider}
        isRootDir={true}
        level={0}
    ></FileTreeItem>
    
{/if}
