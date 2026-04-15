<script lang="ts">
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import { Terminal } from "@xterm/xterm";
    import { FitAddon } from "@xterm/addon-fit";
    import { onMount } from "svelte";
    import type { TypedEvent } from "$lib/base/events/events";
    import type { ExtensionAPI } from "$lib/emulator/types";
  import { getTabContext } from "$lib/components/base/panel";
    let {
        cmd,
        args,
        onUnload,
    }: {
        cmd: string;
        args: string[];
        onUnload?: TypedEvent<void>;
    } = $props();

    const p = usePageAPI();
    const tabContext = getTabContext();
    let d = $state<HTMLDivElement>();
    onMount(() => {
        if (!d) return;
        let term = new Terminal();
        let addon = new FitAddon();
        term.loadAddon(addon);
        term.open(d);
        let psd: Awaited<ReturnType<ExtensionAPI["openPtyToShell"]>>|undefined = undefined;
        let closeOnExit = false;

        const settingsDisposable = p.onTerminalSettingsChanged((s) => {
            closeOnExit = s.closeOnExit;
        });

        addon.fit();
        (async () => {
            closeOnExit = (await p.globalTerminalSettings).closeOnExit;
            let api = await p.ext;

           psd  = await api.openPtyToShell(cmd, args);
            let { readable, writable } = await psd.streams(); // only allowed once
            if (onUnload)
                onUnload(() => {
                    psd?.kill();
                });
            addon.fit();
            await psd.resize(term.cols, term.rows);
            new ResizeObserver((ent) => {
                addon.fit();
                psd?.resize(term.cols, term.rows);
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
                console.log(arg);
                wrtr.write(arg);
            });
            psd.wait().then(exitCode => {
                if (closeOnExit) {
                    tabContext.close();
                } else {
                    const color = exitCode === 0 ? "\x1b[37m" : "\x1b[31m";
                    term.write(`\r\n${color}Process exited with code ${exitCode}\x1b[0m\r\n`);
                }
                psd = undefined;
            });
        })();
        return () => {
            settingsDisposable.dispose();
            psd?.kill();
            term.dispose();
        };
    });
</script>

<div bind:this={d} class="w-full h-full"></div>
