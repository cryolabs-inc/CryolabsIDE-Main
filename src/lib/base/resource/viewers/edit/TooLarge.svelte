<script lang="ts">
    let {fileBuffer}: {fileBuffer: Uint8Array}  =$props();
    
</script>
<div class="text-lg text-center w-full h-full">
    The file ({Math.floor(fileBuffer.byteLength/(1024*1024))} MB) is too large to be opened in this viewer.

</div>