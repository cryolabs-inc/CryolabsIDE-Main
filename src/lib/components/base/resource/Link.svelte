<script lang="ts">
    import { useResourceLinkCtx } from "$lib/base/resourceCtx";
    import type { Snippet } from "svelte";
    import { dndzone } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import type { TabItem } from "../panel/TabbedPanelCtx";
    import path from "path";
    import type { Attachment } from "svelte/attachments";
    let {
        href,
        children,
        ariaLabel,
        target = "_blank",
    }: {
        href: string;
        target?: string;
        children?: Snippet;
        ariaLabel?: string;
    } = $props();
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
</script>

<div>
    <button
        class="cursor-pointer hover:underline border-foreground/80"
        onclick={(e) => {
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
