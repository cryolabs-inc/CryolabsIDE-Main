<script lang="ts">
    import { onMount } from "svelte";
    import Browser from "../Browser.svelte";
    import { usePageAPI } from "../apis/PageAPI";

        let papi = usePageAPI();

    let b = $state<Browser>();
    onMount(()=>{
        if (!b)
            throw new Error("Failed to mount file tree properly.");
        b.tab_open({link: "file-tree:///", target: "file-tree"})
    })
</script>
<Browser bind:this={b} showTabs={false} showAddressBar={false} target="file-tree" >


</Browser>