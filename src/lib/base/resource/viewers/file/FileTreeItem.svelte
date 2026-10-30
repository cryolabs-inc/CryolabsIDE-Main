<script lang="ts">
    import { onMount } from "svelte";
    import Mime from "mime";
    import { FILE_DRAG_TYPE, acceptsFileDrop, dropFiles, startFileDrag, finishFileDrag } from "./fileDrag";
    import { FileEntry, type FT } from "./file";
    import type { TreeDataProvider, TreeItem } from "$lib/base/trees/tree";
    import FileTreeItem from "./FileTreeItem.svelte";
    import { cn } from "$lib/utils";
    import Link from "$lib/components/base/resource/Link.svelte";
    import Collapsible from "$lib/components/ui/collapsible/collapsible.svelte";
    import CollapsibleContent from "$lib/components/ui/collapsible/collapsible-content.svelte";
    import * as comlink from "comlink";
    import type { Disposable } from "$lib/base/disposable";
    import CollapsibleTrigger from "$lib/components/ui/collapsible/collapsible-trigger.svelte";
    import { ChevronDown, ChevronUp } from "@lucide/svelte";
    import ContextMenu from "$lib/components/ui/context-menu/context-menu.svelte";
    import ContextMenuTrigger from "$lib/components/ui/context-menu/context-menu-trigger.svelte";
    import ContextMenuContent from "$lib/components/ui/context-menu/context-menu-content.svelte";
    import { ContextMenuCheckboxItem } from "$lib/components/ui/context-menu";
    import path from "path-browserify";
    import ContextMenuItem from "$lib/components/ui/context-menu/context-menu-item.svelte";
    import ContextMenuSeparator from "$lib/components/ui/context-menu/context-menu-separator.svelte";
    import ContextMenuLabel from "$lib/components/ui/context-menu/context-menu-label.svelte";
    let {
        ftreeItem,
        isRootDir = false,
        tdp,
        level = 0,
        showHiddenEntries = $bindable(false),
        visualIndex,
    }: {
        ftreeItem: FileEntry;
        isRootDir?: boolean;
        tdp: FT;
        level?: number;
        showHiddenEntries?: boolean;
        visualIndex?: number;
    } = $props();
    let childrenTreeItems = $state<FileEntry[] | null>(null);
    let toShowInOrder = $derived<FileEntry[]|null>(childrenTreeItems && childrenTreeItems.slice().sort((a,b)=>a.prio-b.prio));
    let label = $derived(isRootDir ? tdp.rootLabel : ftreeItem.label);
    let dirs = $state<HTMLInputElement>();
    let isSelected = $state<boolean>(false);
    let err = $state<string>();
    let contextMenuActions = $derived.by(() => {
        // Get all selected entries
        const selectedEntries = tdp.allEntries.filter(e => tdp.selectedEntries.has(e.filePath));

        // If current item is selected and there are multiple selections, use those
        if (isSelected && selectedEntries.length > 0) {
            return tdp.getContextMenuActions(selectedEntries);
        }

        // Otherwise, use just this item's actions
        return tdp.getContextMenuActions([ftreeItem]);
    });
    $effect(()=>{
        if (dirs) {
            dirs.focus();
        }
    });
    let dragOver = $state(false);
    let dropError = $state<string>();
    let preparedFile: File | undefined;
    let prepareVersion = 0;
    let alive = true;
    let downloadURL: string | null = null;
    const dropDirectory = $derived(ftreeItem.link ? path.dirname(ftreeItem.filePath) : ftreeItem.filePath);

    async function prepareFile() {
        if (!ftreeItem.link) return;
        const version = ++prepareVersion;
        preparedFile = undefined;
        try {
            const blob = await tdp.fsApi.readLargeFile(ftreeItem.filePath);
            if (alive && version === prepareVersion) {
                preparedFile = new File([blob], path.basename(ftreeItem.filePath), {
                    type: Mime.getType(ftreeItem.filePath) || "application/octet-stream",
                    lastModified: blob.lastModified,
                });
            }
        } catch {
            // Internal moves remain available if the file cannot be exported.
        }
    }
    function beginDrag(e: DragEvent) {
        if (!e.dataTransfer || isRenaming) return;
        e.stopPropagation();
        finishDrag();
        downloadURL = startFileDrag(e.dataTransfer, ftreeItem.filePath, preparedFile);
    }
    function finishDrag() {
        finishFileDrag(downloadURL);
        downloadURL = null;
        dragOver = false;
    }
    function dragOverFolder(e: DragEvent) {
        if (!e.dataTransfer || !acceptsFileDrop(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes(FILE_DRAG_TYPE) ? "move" : "copy";
        dragOver = true;
    }
    function leaveFolder(e: DragEvent) {
        if (e.relatedTarget instanceof Node && (e.currentTarget as HTMLElement).contains(e.relatedTarget)) return;
        dragOver = false;
    }
    async function droppedFile(e: DragEvent) {
        if (!e.dataTransfer || !acceptsFileDrop(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        dragOver = false;
        dropError = undefined;
        try {
            await dropFiles(e.dataTransfer, dropDirectory, tdp.fsApi);
        } catch (error) {
            dropError = error instanceof Error ? error.message : String(error);
        }
    }
    let isRenaming = $state<boolean>(false);
    async function onFinishedRenaming(newValue: string) {
         await tdp.fsApi.renameEntry(ftreeItem.filePath, `${path.dirname(ftreeItem.filePath)}/${newValue}`);
         isRenaming = false;
        
    }
    onMount(() => {
        // Register this entry for range selection
        tdp.registerEntry(ftreeItem, visualIndex);
        void prepareFile();

        const stateSubscription = tdp.onStateShouldChange(({path, state})=>{
            if (path === ftreeItem.filePath) {
                if (state === "rename") {
                    isRenaming = true;
                }
            }
        });

        const selectionSubscription = tdp.onSelected(({selectedPaths})=>{
            isSelected = selectedPaths.has(ftreeItem.filePath);
        });

        let disp: Disposable | undefined = undefined;
        (async () => {
            try {
            let interm = await tdp.getChildren(ftreeItem);
            
            if (interm) childrenTreeItems = interm.slice().sort((a, b)=>{return a.prio - b.prio}) as FileEntry[];
            disp = await tdp.fsApi.watchForRefresh(
                comlink.proxy(async (fsc) => {
                    if (!alive) return;
                    if (ftreeItem.link && fsc.path === ftreeItem.filePath) void prepareFile();
                    if (fsc.isEntryChange && fsc.path === ftreeItem.filePath) {
                        childrenTreeItems = await tdp.getChildren(ftreeItem);
                    }
                }),
            );
            if (!alive) disp.dispose();
            } catch (E) {
                err = "Unable to read directory. <br /> Possible causes: Directory might not exist, or requested view pointed to a file."
            }
        })();
        return () => {
            alive = false;
            preparedFile = undefined;
            finishDrag();
            stateSubscription.dispose();
            selectionSubscription.dispose();
            tdp.unregisterEntry(ftreeItem);
            if (disp) {
                disp.dispose();
            }
        };
    });

    // Re-register when visualIndex changes to maintain correct order
    $effect(() => {
        if (visualIndex !== undefined) {
            tdp.registerEntry(ftreeItem, visualIndex);
        }
    });
</script>

{#snippet childrenLst()}
    {#if toShowInOrder !== null}
        <ul>
            {#each toShowInOrder as ti, idx (ti.filePath)}
                {#if !ti.isHidden || showHiddenEntries}
                <li
                    class={cn(
                        !showHiddenEntries && ti.isHidden && "hidden",
                        ti.isHidden && "text-gray-500",
                    )}
                >
                    <FileTreeItem
                        ftreeItem={ti}
                        isRootDir={false}
                        {tdp}
                        level={level + 1}
                        bind:showHiddenEntries
                        visualIndex={idx}
                    ></FileTreeItem>
                </li>
                {/if}
            {/each}
        </ul>
    {/if}
{/snippet}

{#snippet entry()}
    <div
        class={cn(isRootDir && "text-lg font-bold ", dragOver && "bg-accent text-accent-foreground outline outline-1 outline-primary")}
        role="group"
        ondragover={dragOverFolder}
        ondragleave={leaveFolder}
        ondrop={droppedFile}
        style={`padding-left: ${level * 20}px`}
    >
        {#if isRenaming}
            <input bind:this={dirs} type="text" class="w-full bg-background outline-none border-none" onkeydown={e=>{
                if (!(e.target instanceof HTMLInputElement)) return;
                if (e.key === "Enter") {
                    onFinishedRenaming(e.target.value as string);
                }
            }}  />

        {:else}
        <button
            type="button"
            class={cn(
                "border-l-2 border-foreground/80 px-1 flex flex-row justify-between w-full transition-colors",
                isSelected && "bg-accent text-accent-foreground"
            )}
            onclick={(e) => {
                let cp = e.composedPath();
                let actionElement: HTMLDivElement | null = null;
                for (let t of cp) {
                    if (t instanceof HTMLDivElement) {
                        let attribId = t.getAttribute("data-action");
                        if (attribId) {
                            actionElement = t;
                        }
                    }
                }
                if (!actionElement) {
                    // Determine selection mode based on modifier keys
                    let mode: 'single' | 'add' | 'range' = 'single';
                    if (e.ctrlKey || e.metaKey) {
                        mode = 'add';
                    } else if (e.shiftKey) {
                        mode = 'range';
                    }
                    tdp.changeSelected(ftreeItem, mode);
                }
                else {
                    let dattrib = actionElement.getAttribute("data-action")!;
                    let theAction = ftreeItem.actions.filter(
                        (v) => v.id === dattrib,
                    )[0];
                    theAction.callback(tdp, ftreeItem, e);
                }
            }}
        >
            <div class="flex flex-row items-center gap-1 w-full justify-between">
                <div class="flex flex-row items-center gap-1">
                    <div>
                        <ChevronDown class="hidden group-data-[state=open]:block"
                        ></ChevronDown>
                        <ChevronUp class="hidden group-data-[state=closed]:block"
                        ></ChevronUp>
                    </div>
                    {#if ftreeItem.link}
                        <Link
                            role="directory"
                            ondragstart={beginDrag}
                            ondragend={finishDrag}
                            draggable={!isRenaming}
                            href={ftreeItem.link.href}
                            target={ftreeItem.link.target}
                        >
                            {ftreeItem.label}
                        </Link>
                    {:else}
                        <div
                            role="directory"
                            draggable={!isRenaming}

                            ondragstart={beginDrag}
                            ondragend={finishDrag}

                        >
                            {label}
                        </div>
                    {/if}
                </div>
                    <div class="flex flex-row gap-1">
                        {#each ftreeItem.actions as act (act.id)}
                            <div
                                role="button"
                                tabindex="0"
                                class="hover:text-accent-foreground/80 cursor-pointer"
                                data-action={act.id}
                                title={act.label}
                                onclick={(e)=>{
                                    e.stopPropagation();
                                    act.callback(tdp, ftreeItem, e);
                                }}
                                onkeydown={(e)=>{
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        act.callback(tdp, ftreeItem, e);
                                    }
                                }}
                            >
                                <act.icon {...act.props}></act.icon>
                            </div>
                        {/each}
                    </div>
            </div>
        </button>
        {/if}
    </div>
    
{/snippet}
{#if err!=null}
<div>{@html err}</div>
{:else}
<div ondrop={droppedFile} role="group" ondragover={(e) => {
    if (!e.dataTransfer || !acceptsFileDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
}}>
    {#if dropError}<p role="alert" class="text-destructive text-sm px-2">{dropError}</p>{/if}
    <ContextMenu>
        <ContextMenuTrigger>
            {#if childrenTreeItems !== null}
                <Collapsible
                    class="w-full"
                    disabled={!childrenTreeItems}
                    open={true}
                >
                    <CollapsibleTrigger
                        class="cursor-pointer w-full text-left group"
                    >
                        {@render entry()}
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                        {@render childrenLst()}
                    </CollapsibleContent>
                </Collapsible>
            {:else}
                {@render entry()}
            {/if}
        </ContextMenuTrigger>

        <ContextMenuContent>
            <ContextMenuLabel>Folder options</ContextMenuLabel>
            <ContextMenuCheckboxItem bind:checked={showHiddenEntries}
                >Show hidden files</ContextMenuCheckboxItem
            >
            <ContextMenuSeparator></ContextMenuSeparator>
            <ContextMenuLabel>
                {#if isSelected && tdp.selectedEntries.size > 1}
                    {tdp.selectedEntries.size} items selected
                {:else}
                    Entry options
                {/if}
            </ContextMenuLabel>
            {#if contextMenuActions.length === 0}
                <div class="text-sm bg-accent-foreground/10">(No entry options available.)</div>
            {/if}
            {#each contextMenuActions as ac(ac.id)}
                <ContextMenuItem onclick={ac.callback.bind(null, tdp, ftreeItem)}>{ac.label}</ContextMenuItem>
            {/each}
        </ContextMenuContent>
    </ContextMenu>
</div>
{/if}