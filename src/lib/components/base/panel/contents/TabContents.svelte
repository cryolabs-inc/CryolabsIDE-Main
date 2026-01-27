<script lang="ts">
    import type { Snippet } from "svelte";
    import { setTabContentsCtx, TabContentsCtx } from "../TabbedPanelCtx";
    let {tc, children}: {tc: TabContentsCtx, children: Snippet} = $props();
    
    $effect(()=>{
        setTabContentsCtx(tc);
    })
</script>
{@render children()}