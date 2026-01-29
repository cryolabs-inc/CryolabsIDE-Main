<script lang="ts">
    import FullEditor from "$lib/components/base/fulleditor/FullEditor.svelte";
    import type { WorkerHandlerAPI } from "$lib/emulator/types";
    import * as comlink from 'comlink';
    import { onMount } from "svelte";
    import yaml from 'yaml';
    onMount(async () => {
        
    });
</script>
{#await fetch("/manual_config.yaml").then(v=>v.text()).then(v=>yaml.parse(v))}


{:then config}
    <FullEditor basePath={config.emulator_base}></FullEditor>
{:catch}
    <FullEditor basePath={"/"}></FullEditor>

{/await}
