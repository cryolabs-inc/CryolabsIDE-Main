<script lang="ts">
    import { getAllContexts, onMount, type ComponentProps, type Snippet } from "svelte";
    import Browser from "../panel/Browser.svelte";
    import { scale } from "svelte/transition";
    import { Minimize2Icon, MinimizeIcon, MinusIcon, XIcon } from "@lucide/svelte";
    import { cn } from "$lib/utils";
    interface WProps extends ComponentProps<typeof Browser> {
        onLoaded: (browser: Browser)=>void;
        class: string;
        close: ()=>void;
        minimize: ()=>void;
    }
     let px: WProps = $props();
    let b = $state<Browser>();
    let title = $state<string>("Loading...");
    onMount(()=>{
        b?.onActiveTabChanged((dat)=>{
            title = dat.name;
        })
        px.onLoaded(b!);
    })
    
    export function getBrowser() {
        return b;
    }
</script>

<div class={cn(px.class, `relative`)} in:scale out:scale={{duration: 100}}>
    <div class="w-full flex flex-row ">
        <button class="hover:text-red-400" onclick={e=>{
            px.close();
        }} ><XIcon></XIcon></button>
        <button class="hover:text-red-400" onclick={e=>{
            px.minimize();
        }}><MinusIcon></MinusIcon></button>
        <div class="justify-self-center pl-4 select-none">asdf</div>
    </div>
    <Browser bind:this={b} {...px}></Browser>
</div>