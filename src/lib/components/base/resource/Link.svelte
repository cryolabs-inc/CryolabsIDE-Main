<script lang="ts">
    import { useResourceLinkCtx } from "$lib/base/resourceCtx";
    import type { Snippet } from "svelte";
    import { dndzone } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import type { TabItem } from "../panel/TabbedPanelCtx";
    import path from "path-browserify";
    import type { Attachment } from "svelte/attachments";
    import {type HTMLAttributes} from 'svelte/elements';
    import { getWM } from "../windows/WM";
    interface Props extends HTMLAttributes<HTMLDivElement> {
        href: string;
        target?: string;
        children?: Snippet;
        ariaLabel?: string;
        isPopup?: boolean
    } 
    let {
        href,
        children,
        ariaLabel,
        target = "_blank",
        isPopup = false,
        ...divParts
    }: Props  = $props();

    let rctx = useResourceLinkCtx();
    let uuid = $state(crypto.randomUUID());
    let name = $derived(path.basename(new URL(href).pathname));
    let def: TabItem[] = $derived([
        {
            clickable: true,
            id: uuid,
            name,
            objectURL: href,
            state: "none",
        },
    ] as TabItem[]);
    let wm = getWM();
</script>

<div {...divParts}>
    <button
        class="cursor-pointer hover:underline border-foreground/80"
        draggable="true"
        ondragstart={(e) => {
            e.dataTransfer?.setData("text", JSON.stringify({ type: "url", url: href }));
        }}
        onclick={(e) => {
            console.log("Link target: " + target);
            if (isPopup) {
                wm.launchWindow(href, {openMode: "position", position: {
                    X: e.clientX,
                    Y: e.clientY
                }});
                return;
            };
            if (e.shiftKey) {
                rctx.dispatchEventClicked({
                    link: href,
                    target: "_blank",
                });
            }
            rctx.dispatchEventClicked({ link: href, target });
        }}
    >
        {@render children?.()}
    </button>
</div>
