<script lang="ts">
    import { ResourceLinkContext, setResourceLinkCtx } from "$lib/base/resourceCtx";
    import { getContext, setContext, type Snippet } from "svelte";
    let {children}:{children: Snippet} = $props();
    setResourceLinkCtx(new ResourceLinkContext());
</script>
{@render children()}