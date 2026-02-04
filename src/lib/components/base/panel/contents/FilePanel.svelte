<script lang="ts">
    import { onMount } from "svelte";
    import Browser from "../Browser.svelte";
    import { usePageAPI } from "../apis/PageAPI";


    let b = $state<Browser>();
    let papi = usePageAPI();
    onMount(()=>{
        if (!b)
            throw new Error("Failed to mount file tree properly.");
        let path = new URL(papi.rootURL).pathname;
        b.tab_open({link: "file-tree://" + path, target: "file-tree"})
    })
</script>
<Browser bind:this={b} showTabs={false} showAddressBar={false} target="file-tree" >


</Browser>