<script lang="ts">
    import FullEditor from "$lib/components/base/fulleditor/FullEditor.svelte";
    import type { WorkerHandlerAPI } from "$lib/emulator/types";
    import * as comlink from 'comlink';
    import { onMount } from "svelte";
    import yaml from 'yaml';
    import { normalizeRootURI } from '$lib/base/resource/rootURI';
    const pageURL = new URL(location.href);
    let rootURL = "file:///user";
    let u = pageURL.searchParams.get('url');
    if (u) {
        rootURL = normalizeRootURI(u);
        if (rootURL !== u) {
            pageURL.searchParams.set('url', rootURL);
            history.replaceState(history.state, '', pageURL.href);
        }
    }
</script>
{#await fetch("/manual_config.yaml").then(v=>v.text()).then(v=>yaml.parse(v))}


{:then config}
    <FullEditor
        basePath={config.emulator_base}
        {rootURL}
        emulatorConfig={{
            diskPath: config.disk_path,
            bzImagePath: config.bzimage_path,
            initrdPath: config.initrd_path,
            doNotStartEmulator: config.do_not_start_emulator,
            disk_version: config.disk_version??"0.0.7"
        }}
    ></FullEditor>
{:catch}
    <FullEditor basePath="/" {rootURL}></FullEditor>

{/await}
