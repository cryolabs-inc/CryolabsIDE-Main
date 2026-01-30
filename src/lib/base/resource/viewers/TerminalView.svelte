<script lang="ts">
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import { Terminal } from "@xterm/xterm";
    import { FitAddon } from "@xterm/addon-fit";
    import { onMount } from "svelte";
    let { termId }: { termId: string } = $props();

    let p = usePageAPI();
    let val = $derived(p.getTerminal(termId));
    let d = $state<HTMLDivElement>();
    onMount(() => {
        if (!d) {
            return;
        }
        let term = new Terminal();
        let addon = new FitAddon();
        val.term.textEv((dat) => {
            term.write(dat);
        });
        term.loadAddon(addon);
        term.open(d);
        addon.fit();
        let shouldResizeEvent = val.term.onResizeNeeded(() => {
            addon.fit();
        });
        term.onData((arg) => {
            val.term.write(arg);
        });
        return () => {
            term.dispose();
            shouldResizeEvent.dispose();
        };
    });
</script>

<div bind:this={d} class="w-full h-full"></div>
