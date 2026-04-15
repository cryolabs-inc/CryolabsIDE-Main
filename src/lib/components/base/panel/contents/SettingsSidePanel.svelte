<script lang="ts">
    import { onMount } from "svelte";
    import { usePageAPI } from "../apis/PageAPI";
  import { getTabContext } from "..";

    let papi = usePageAPI();

    onMount(() => {
        papi.openLink("settings:///", "upper");
    });
</script>
