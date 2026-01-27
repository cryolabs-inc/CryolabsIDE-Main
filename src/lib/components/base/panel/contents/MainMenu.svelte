<script lang="ts">
    import Link from "../../resource/Link.svelte";

    

</script>
<div class="h-full">
<div class="text-xl">Welcome to CryolabsIDE!</div>

    <Link href="sample:///asdf" target="_self">
        Open sample link
    </Link>
    <Link href="sample:///flex" target="_self">
        open flex
    </Link>
    <Link href="file:///test.txt" target="_blank">
        omg
    </Link>
    <Link href="term:///serial0" target="tabs_lower">
        open serial0
    </Link>
</div>