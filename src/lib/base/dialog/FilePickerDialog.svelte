<svelte:options runes />

<script lang="ts">
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import { type FSProviderAPI } from "$lib/emulator/types";
    import { onMount } from "svelte";
    import { FileEntry, FT } from "$lib/base/resource/viewers/file/file";
    import FileTreeItem from "$lib/base/resource/viewers/file/FileTreeItem.svelte";
    import type { FilePickerMode, FilePickerOptions } from "./DialogManager";
    import DialogFooter from "$lib/components/ui/dialog/dialog-footer.svelte";
    import Button from "$lib/components/ui/button/button.svelte";

    let { options, onConfirm, onCancel }: {
        options: FilePickerOptions;
        onConfirm: (path: string) => void;
        onCancel: () => void;
    } = $props();

    let fileAPI = $state<FSProviderAPI | undefined>(undefined);
    let papi = usePageAPI();
    let rootFileEntry = $state<FileEntry>(new FileEntry(options.rootDir, "directory", papi, true, "_never"));
    let treeDataProvider = $state<FT | undefined>(undefined);
    let selectedPath = $state<string | null>(null);
    let selectedIsFile = $state<boolean>(false);

    function isSelectionValid(path: string | null, isFile: boolean, mode: FilePickerMode = 'both'): boolean {
        if (!path) return false;
        if (mode === 'file') return isFile;
        if (mode === 'directory') return !isFile;
        return true;
    }

    let canConfirm = $derived(isSelectionValid(selectedPath, selectedIsFile, options.mode));

    onMount(() => {
        (async () => {
            fileAPI = await papi.fs;
            rootFileEntry = new FileEntry(options.rootDir, "directory", papi, true, "_never");
            const tdp = new FT(fileAPI, papi, rootFileEntry, "_never");
            tdp.onSelected(({ selectedPaths }) => {
                if (selectedPaths.size === 0) {
                    selectedPath = null;
                    return;
                }
                const firstPath = [...selectedPaths][0];
                selectedPath = firstPath;
                const entry = tdp.allEntries.find(e => e.filePath === firstPath);
                selectedIsFile = entry ? !!entry.link : false;
            });
            treeDataProvider = tdp;
        })();
    });
</script>

<div class="min-h-48 max-h-80 overflow-y-auto border rounded p-2 font-mono text-sm">
    {#if treeDataProvider}
        <FileTreeItem
            ftreeItem={rootFileEntry}
            tdp={treeDataProvider}
            isRootDir={true}
            level={0}
        />
    {:else}
        <div class="text-muted-foreground text-sm p-2">Loading file system...</div>
    {/if}
</div>

{#if selectedPath}
    <div class="text-xs text-muted-foreground truncate px-1" title={selectedPath}>
        {selectedPath}
    </div>
{/if}

<DialogFooter>
    <Button variant="secondary" onclick={onCancel}>Cancel</Button>
    <Button onclick={() => { if (selectedPath) onConfirm(selectedPath); }} disabled={!canConfirm}>
        OK
    </Button>
</DialogFooter>
