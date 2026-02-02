<script
    lang="ts"
    generics="T extends (Item & {id: string, clickable: boolean})"
>
    
    import {
        type Snippet,
    } from "svelte";
    import {
        dndzone,
        TRIGGERS,
        type Item,
        type Options,
    } from "svelte-dnd-action";
    import { twMerge, type ClassNameValue } from "tailwind-merge";
    import type { HTMLAttributes } from "svelte/elements";
    interface DProps extends HTMLAttributes<HTMLDivElement> {
        orientation: "horizontal" | "vertical";
        items: T[];
        Comp: Snippet<[item: T]>;
        selected?: string;
        dndZoneProps?: Partial<Options<T>>;
        class?: string;
    }
    let {
        items = $bindable(),
        Comp,
        selected = $bindable(""),
        orientation = "horizontal",
        dndZoneProps = {},
        class: c,
        ...restDivProps
    }: DProps = $props();
    let hoverColor: ClassNameValue = "bg-foreground-500/50";

    let notHover: ClassNameValue = "bg-foreground-500/20";
    let selIndex = $derived(items.findIndex((v) => v.id === selected));
    let v = $derived(orientation === "vertical" ? "border-r-2" : "border-b-2");
</script>

<div
    class="h-full flex flex-col w-full"
    role="tabpanel"
    ondragover={(e) => {
        e.preventDefault();
    }}
    ondrop={(e) => {
        if (e.dataTransfer) {
            let fa = e.dataTransfer.getData("text");
            if (fa) {
                try {
                    let parsed = JSON.parse(fa);
                    if (parsed.type === "url") {
                        let fileURL = new URL(parsed.url);
                    }
                } catch {}
            }
        }
    }}
    tabindex="0"
    {...restDivProps}
>
    <div
        class={twMerge(
            "flex flex-col h-full w-full justify-start flex-1",
            orientation === "horizontal" && "flex-row min-h-4",
            c,
        )}
        use:dndzone={{ flipDurationMs: 20, items: items, ...dndZoneProps }}
        onfinalize={(e) => {
            let oldSelIndex = selIndex;

            items = e.detail.items;
            if (e.detail.info.trigger === TRIGGERS.DROPPED_INTO_ZONE) {
                selected = e.detail.info.id;
            } else {
                if (selected !== e.detail.info.id) {
                    return; // nothing to do.
                }
                if (oldSelIndex === 0) {
                    oldSelIndex++;
                } else {
                    oldSelIndex--;
                }
                selected = items[oldSelIndex].id;
            }
        }}
        onconsider={(e) => {
            // let ve = e.detail.info.id;
            // let idx = items.findIndex(v=>v.id === ve);
            // if (idx === 0) {
            //     idx++;
            // }
            // else {
            //     idx--;
            // }
            // if (e.detail.info.trigger === TRIGGERS.DRAG_STARTED)
            //     selected = items[idx].id;
            items = e.detail.items;
        }}
    >
        {#each items as it (it.id)}
            <button
                onclick={(e) => {
                    selected = it.id;
                }}
                class={twMerge(
                    "cursor-grab hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/80 flex items-center justify-center",
                    selected === it.id &&
                        `${v} border-solid bg-accent/40 border-forground`,
                )}
            >
                {@render Comp(it)}
            </button>
        {/each}
    </div>
</div>
