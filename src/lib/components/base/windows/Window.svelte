<script lang="ts">
    import { getAllContexts, onMount, type ComponentProps, type Snippet } from "svelte";
    import Browser from "../panel/Browser.svelte";
    import { scale } from "svelte/transition";
    import { MaximizeIcon, Minimize2Icon, MinimizeIcon, MinusIcon, XIcon } from "@lucide/svelte";
    import { cn } from "$lib/utils";
  import { usePageAPI } from "../panel/apis/PageAPI";
    

    const pageAPI = usePageAPI();

    let variantClass = $state(pageAPI.variant + "-cryolabs");

    $effect(() => {
        const disposable = pageAPI.onGlobalVariantChanged((newVariant) => {
            variantClass = newVariant + "-cryolabs";
        });
        return () => disposable.dispose();
    });
    interface WProps extends ComponentProps<typeof Browser> {
        onLoaded: (browser: Browser)=>void;
        class: string;
        close: ()=>void;
        minimize: ()=>void;
        maximize: ()=>void;
    }
     let px: WProps = $props();
    let b = $state<Browser>();
    let title = $state<string|Snippet<[]>>("Loading...");
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

<div class={cn(px.class, `relative w-full h-full flex flex-col ${variantClass} bg-background text-foreground`)} in:scale out:scale={{duration: 100}}>
    <div class="w-full h-[20pt] flex flex-row toolbar-win">
        <button class="hover:text-red-400" onclick={e=>{
            px.close();
        }} ><XIcon></XIcon></button>
        <button class="hover:text-red-400" onclick={e=>{
            px.minimize();
        }}><MinusIcon></MinusIcon></button>
        <button class="hover:text-red-400" onclick={e=>{
            px.maximize();
        }}><MaximizeIcon></MaximizeIcon></button>
        <div class="justify-self-center pl-4 select-none">asdf</div>
    </div>
    <div class="w-full flex-1 min-h-0 overflow-hidden">
<Browser bind:this={b} {...px}></Browser>
    </div>
</div>