<script lang="ts">
    import { onMount } from "svelte";
    import Browser from "../Browser.svelte";
    import { usePageAPI } from "../apis/PageAPI";

        let papi = usePageAPI();

    onMount(()=>{
        papi.openLink("term:///serial0", "file-tree");
    });

</script>
<Browser showTabs={false} showAddressBar={false} target="file-tree" >


</Browser>