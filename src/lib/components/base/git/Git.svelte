<script lang="ts">
    import { onMount } from "svelte";
    import Browser from "../panel/Browser.svelte";
    let b = $state<Browser>();
    onMount(()=>{
        if (b) {
            b.tab_open({link: "git:///ui"});
        }
    })
</script>
<Browser bind:this={b} showTabs={false} showAddressBar={false}>


</Browser>