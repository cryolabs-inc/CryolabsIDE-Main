<script lang="ts">
    let {dat}: {dat: Uint8Array} = $props();
    let textdec = new TextDecoder();
    let vl = $derived(textdec.decode(dat));
</script>
<pre>
    {vl}

</pre>