<script lang="ts">
    import * as monaco from 'monaco-editor';
  
    import { onMount } from 'svelte';
    let {value: value, onChangeContent = ()=>{}}: {value: Blob, onChangeContent?: (newBuffer: Uint8Array)=>void} = $props();
    let dec = new TextDecoder();
    let enc = new TextEncoder();
    
    let divElem = $state<HTMLDivElement>();
    
    onMount(async ()=>{
        if (!divElem) return;
        let ab = await value.arrayBuffer();
        let u8 = new Uint8Array(ab);
        
        let edit = monaco.editor.create(divElem, {value: dec.decode(u8), language: value.type});
        
        let model = edit.getModel();
        
        if (model){

            model.onDidChangeContent((e)=>{
                let val = model.getValue();
                onChangeContent(enc.encode(val));
            })
        }
    });
</script>
<div class="h-full w-full" bind:this={divElem}>

</div>