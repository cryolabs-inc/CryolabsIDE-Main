<script lang="ts">
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import { type FSProviderAPI } from "$lib/emulator/types";
    import { onMount } from "svelte";
    import { FileEntry, FT } from "./file";
    import FileTreeItem from "./FileTreeItem.svelte";
    let { rootDir }: { rootDir: string } = $props();
    let fileAPI = $state<FSProviderAPI>();
    let papi = usePageAPI();
    let treeDataProvider = $derived<FT | undefined>(
        fileAPI && new FT(fileAPI, papi),
    );
    onMount(()=>{
        (async()=>{
            fileAPI = await papi.fs;
        })()
    });
</script>

{#if treeDataProvider}
    <FileTreeItem
        ftreeItem={new FileEntry(rootDir, "directory", papi, true)}
        tdp={treeDataProvider}
        isRootDir={true}
        level={0}
    ></FileTreeItem>
{/if}
