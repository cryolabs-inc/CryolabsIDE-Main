<script lang="ts">
    import { onMount } from "svelte";
    import type { FileEntry, FT } from "./file";
    import type { TreeDataProvider } from "$lib/base/trees/tree";
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
    import { S_IFDIR, S_IFMT } from "@zenfs/core/constants.js";
    import path from "path";
    import ContextMenuItem from "$lib/components/ui/context-menu/context-menu-item.svelte";
    import ContextMenuSeparator from "$lib/components/ui/context-menu/context-menu-separator.svelte";
    import ContextMenuLabel from "$lib/components/ui/context-menu/context-menu-label.svelte";
    let {
        ftreeItem,
        isRootDir = false,
        tdp,
        level = 0,
        showHiddenEntries = $bindable(false),
    }: {
        ftreeItem: FileEntry;
        isRootDir?: boolean;
        tdp: FT;
        level?: number;
        showHiddenEntries?: boolean;
    } = $props();
    let childrenTreeItems = $state<FileEntry[] | null>(null);
    let label = $derived(isRootDir ? tdp.rootLabel : ftreeItem.label);
    let dirs = $state<HTMLInputElement>();
    $effect(()=>{
        if (dirs) {
            dirs.focus();
        }
    });
    async function highlightTarget(e: DragEvent) {
        let elem = wholeDiv;
        if (elem) {
            elem.classList.add("dragging-over");
            console.log("dragging over, ", e.currentTarget, wholeDiv);

        }
        e.stopImmediatePropagation();
        e.preventDefault();
    }
    async function stopHighlightingTarget(e: DragEvent, force = false) {
        let elem = wholeDiv;
        if (!force && elem !== e.currentTarget) {
            return;
        }
        if (elem) {
            elem.classList.remove("dragging-over");
        }
        e.stopImmediatePropagation();
        e.preventDefault();
    }
    async function droppedFile(nwPath: string, e: DragEvent) {
        if (!e.dataTransfer) {
            return;
        }
        e.stopPropagation();
        stopHighlightingTarget(e, true);
        
        (e.target as HTMLElement).classList.remove("dragging-over");
        if (e.dataTransfer.files.length > 0) {
            let firstFile = e.dataTransfer.files[0];
            let firstArr = new Uint8Array(await firstFile.arrayBuffer());
            await tdp.fsApi.writeFile(path.resolve(ftreeItem.filePath, firstFile.name), comlink.transfer(firstArr.buffer, [firstArr.buffer]))
        }
        let dat = e.dataTransfer.getData("text");
        if (dat) {
            let d = JSON.parse(dat) as {
                type: "url";
                url: string
            };
            let pathRetrieved = new URL(d.url).pathname;
            if (pathRetrieved) {
                
                let st = await tdp.fsApi.stat(nwPath);
                if ((st.mode & S_IFMT) === S_IFDIR) {
                    nwPath = path.resolve(nwPath, path.basename(pathRetrieved));
                }
                tdp.fsApi.renameEntry(pathRetrieved, nwPath);
                // we will mvoe from path a to path b.
            }
        }
    }
    function isTargetCandidate(e: DragEvent) {
        if (
            e.target instanceof HTMLDivElement &&
            e.target.getAttribute("data-isFileDropZone")
        ) {
            return true;
        }
        return false;
    }
    let isRenaming = $state<boolean>(false);
    async function onFinishedRenaming(newValue: string) {
         await tdp.fsApi.renameEntry(ftreeItem.filePath, `${path.dirname(ftreeItem.filePath)}/${newValue}`);
         isRenaming = false;
        
    }
    onMount(() => {
        
        tdp.onStateShouldChange(({path, state})=>{
            if (path === ftreeItem.filePath) {
                if (state === "rename") {
                    isRenaming = true;
                }
            }
        });
        let disp: Disposable | undefined = undefined;
        (async () => {
            childrenTreeItems = await tdp.getChildren(ftreeItem);
            disp = await tdp.fsApi.watchForRefresh(
                comlink.proxy(async (fsc) => {
                    if (fsc.isEntryChange && fsc.path === ftreeItem.filePath) {
                        childrenTreeItems = await tdp.getChildren(ftreeItem);
                    }
                }),
            );
        })();
        return () => {
            if (disp) {
                disp.dispose();
            }
        };
    });
    let wholeDiv = $state<HTMLDivElement>();
</script>

{#snippet childrenLst()}
    {#if childrenTreeItems !== null}
        <ul>
            {#each childrenTreeItems as ti (ti.filePath)}
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
                    ></FileTreeItem>
                </li>
            {/each}
        </ul>
    {/if}
{/snippet}

{#snippet entry()}
    <div
        class={cn(isRootDir && "text-lg font-bold ")}
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
            class="border-l-2 border-foreground/80 px-1 flex flex-row justify-between"
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
                if (!actionElement) tdp.changeSelected(ftreeItem);
                else {
                    let dattrib = actionElement.getAttribute("data-action")!;
                    let theAction = ftreeItem.actions.filter(
                        (v) => v.id === dattrib,
                    )[0];
                    theAction.callback(tdp, ftreeItem, e);
                }
            }}
        >
            <div class="flex flex-row">

                <div>
                    <ChevronDown class="hidden group-data-[state=open]:block"
                    ></ChevronDown>
                    <ChevronUp class="hidden group-data-[state=closed]:block"
                    ></ChevronUp>
                </div>
                {#if ftreeItem.link}
                    <Link
                        role="directory"
                        ondragstart={async (e) => {
                            e.dataTransfer?.setData(
                                "text",
                                JSON.stringify({
                                    type:  "url",
                                    url: `file://${ftreeItem.filePath}`
                                }),
                            );
                        }}
                        draggable={!isRenaming}
                        href={ftreeItem.link.href}
                        target={"_blank"}
                    >
                        {ftreeItem.label}
                    </Link>
                {:else}
                    <div
                        role="directory"
                        draggable={!isRenaming}
                        
                        ondragstart={(e) => {
                            if (!e.dataTransfer) return;
                            if (e.target instanceof HTMLDivElement) {
                                e.dataTransfer.setData(
                                    "text",
                                    JSON.stringify({
                                        type: "url",
                                        url: new URL(`file://${ftreeItem.filePath}`)
                                    }),
                                );
                            }
                        }}
                        
                    >
                        {label}
                    </div>
                {/if}
            </div>
            <!-- {#if ftreeItem.actions}
                {#each ftreeItem.actions as act (act.label)}
                    <div
                        role="directory"
                        draggable
                        class="group-hover:text-green-400"
                        data-action={act.id}
                        ondragstart={(e) => {
                            e.dataTransfer?.setData(
                                "text",
                                (e.target as HTMLDivElement).getAttribute(
                                    "data-action",
                                )!,
                            );
                        }}
                    >
                        <act.icon {...act.props}></act.icon>
                    </div>
                {/each}
            {/if} -->
            
        </button>
        {/if}
    </div>
    
{/snippet}
<div bind:this={wholeDiv} ondrop={droppedFile.bind(null, ftreeItem.filePath)} role="directory" ondragover={e=>{
    
    e.preventDefault();
}} ondragenter={highlightTarget} ondragleave={stopHighlightingTarget}>
    <ContextMenu>
        <ContextMenuTrigger>
            {#if childrenTreeItems !== null}
                <Collapsible
                    class="w-full"
                    disabled={isRootDir || !childrenTreeItems}
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
            <ContextMenuLabel>Entry options</ContextMenuLabel>
            {#if ftreeItem.actions.length === 0}
                <div class="text-sm bg-accent-foreground/10">(No entry options available.)</div>
            {/if}
            {#each ftreeItem.actions as ac(ac.id)}
                <ContextMenuItem onclick={ac.callback.bind(null, tdp, ftreeItem)}>{ac.label}</ContextMenuItem>
            {/each}
        </ContextMenuContent>
    </ContextMenu>
</div>
