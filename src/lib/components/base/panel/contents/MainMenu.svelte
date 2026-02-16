<script lang="ts">
    import { CompletionTriggerKind } from "typescript";
    import Link from "../../resource/Link.svelte";
    import { getWM } from "../../windows/WM";
    import { usePageAPI } from "../apis/PageAPI";
    import * as comlink from 'comlink';
    let wm = getWM();
    let papi = usePageAPI();
    
    let cmdSearchParams = new URLSearchParams();
    cmdSearchParams.append("cmd", "/usr/bin/spawn-in");
    cmdSearchParams.append("args", "/root" + papi.rootPath);
    cmdSearchParams.append("args", "/bin/bash");
    cmdSearchParams.append("args", "-i");
    
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
    <Link href="term:///serial0" target="_blank" isPopup={true}> 
        open serial0 in new window.
    </Link>
    <Link href={"term:///pty?"+cmdSearchParams.toString()} target="tabs_lower" isPopup={true}> 
        open /bin/bash in new window.
    </Link>
    <button onclick={e=>{
        papi.ext.then(v=>{
            v.update(comlink.proxy(()=>{}));
        })
    }}>
        Update dis
    </button>
</div>