<script lang="ts">
    import FullEditor from "$lib/components/base/fulleditor/FullEditor.svelte";
    import type { WorkerHandlerAPI } from "$lib/emulator/types";
    import * as comlink from 'comlink';
    import { onMount } from "svelte";
    onMount(async () => {
        
    });
</script>

<FullEditor basePath={"/"} ></FullEditor>
