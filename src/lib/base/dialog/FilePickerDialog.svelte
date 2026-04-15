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
    let filename = $state<string>("");

    function isSelectionValid(path: string | null, isFile: boolean, mode: FilePickerMode = 'both'): boolean {
        if (!path) return false;
        if (mode === 'file') return isFile;
        if (mode === 'directory') return !isFile;
        return true;
    }

    let canConfirm = $derived(
        options.saveAs
            ? filename.trim().length > 0
            : isSelectionValid(selectedPath, selectedIsFile, options.mode)
    );

    function confirmPath(): string | null {
        if (options.saveAs) {
            const dir = (selectedPath && !selectedIsFile) ? selectedPath : options.rootDir;
            return dir + "/" + filename.trim();
        }
        return selectedPath;
    }

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
                const entry = tdp.allEntries.find(e => e.filePath === firstPath);
                const isFile = entry ? !!entry.link : false;

                if (options.saveAs) {
                    if (isFile) {
                        const lastSlash = firstPath.lastIndexOf('/');
                        filename = lastSlash >= 0 ? firstPath.slice(lastSlash + 1) : firstPath;
                        selectedPath = lastSlash > 0 ? firstPath.slice(0, lastSlash) : '/';
                    } else {
                        selectedPath = firstPath;
                    }
                    selectedIsFile = false;
                } else {
                    selectedPath = firstPath;
                    selectedIsFile = isFile;
                    if (options.confirmOnClick && isSelectionValid(selectedPath, selectedIsFile, options.mode)) {
                        onConfirm(selectedPath);
                    }
                }
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

{#if options.saveAs}
    <div class="flex flex-row items-center gap-2 px-1">
        <span class="text-xs text-muted-foreground shrink-0">File name:</span>
        <input
            class="flex-1 text-sm border rounded px-2 py-1 bg-background"
            type="text"
            bind:value={filename}
            placeholder="Enter file name..."
        />
    </div>
{:else if selectedPath}
    <div class="text-xs text-muted-foreground truncate px-1" title={selectedPath}>
        {selectedPath}
    </div>
{/if}

<DialogFooter>
    {#if !options.required}
        <Button variant="secondary" onclick={onCancel}>Cancel</Button>
    {/if}
    <Button onclick={() => { const p = confirmPath(); if (p) onConfirm(p); }} disabled={!canConfirm}>
        {options.saveAs ? "Save" : "OK"}
    </Button>
</DialogFooter>
