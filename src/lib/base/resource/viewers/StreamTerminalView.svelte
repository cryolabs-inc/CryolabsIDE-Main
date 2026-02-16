<script lang="ts">
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import { Terminal } from "@xterm/xterm";
    import { FitAddon } from "@xterm/addon-fit";
    import { onMount } from "svelte";
    import type { TypedEvent } from "$lib/base/events/events";
    let {
        cmd,
        args,
        onUnload,
    }: {
        cmd: string;
        args: string[];
        onUnload?: TypedEvent<void>;
    } = $props();

    let p = usePageAPI();

    let d = $state<HTMLDivElement>();
    onMount(() => {
        if (!d) return;
        let term = new Terminal();
        let addon = new FitAddon();
        term.loadAddon(addon);
        term.open(d);

        addon.fit();
        (async () => {
            let api = await p.ext;

            let psd = await api.openPtyToShell(cmd, args);
            let { readable, writable } = await psd.streams(); // only allowed once
            if (onUnload)
                onUnload(() => {
                    psd.kill();
                });
            addon.fit();
            await psd.resize(term.cols, term.rows);
            new ResizeObserver((ent) => {
                addon.fit();
                psd.resize(term.cols, term.rows);
            }).observe(d);
            

            let ts = new TextEncoderStream();
            ts.readable.pipeTo(writable);
            let wrtr = ts.writable.getWriter();
            let rdr = readable.getReader();
            if (!d) {
                return;
            }
            (async () => {
                while (true) {
                    let val = await rdr.read();
                    if (val.done) {
                        return;
                    }
                    term.write(val.value);
                }
            })();

            term.onData((arg) => {
                wrtr.write(arg);
            });
        })();
        return () => {
            term.dispose();
        };
    });
</script>

<div bind:this={d} class="w-full h-full"></div>
