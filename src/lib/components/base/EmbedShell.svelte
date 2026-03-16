<script lang="ts">
    import { getAllContexts, onMount, type Snippet } from "svelte";
    import { ResourceManager, setResourceManager } from "$lib/base/resource";
    import { PageAPI, setPageAPI } from "./panel/apis/PageAPI";
    import { ResourceLinkContext, setResourceLinkCtx } from "$lib/base/resourceCtx";
    import { setWM, WM } from "./windows/WM";
    import DialogContainer from "$lib/base/dialog/DialogContainer.svelte";

    let {
        rootURL = "file:///",
        onLinkOpened,
        onReady,
        children,
    }: {
        /** Root URL passed to PageAPI (e.g. "file:///myproject/"). */
        rootURL?: string;
        /** Called whenever a link is dispatched via papi.openLink(). The embedder is
         *  responsible for routing it to a Browser or handling it another way. */
        onLinkOpened?: (link: string, target: string) => void;
        /** Called once the PageAPI context is set up and ready to use. */
        onReady?: (papi: PageAPI, resourceManager: ResourceManager) => void;
        children?: Snippet;
    } = $props();

    let resourceManager = new ResourceManager();
    ResourceManager.addDefaultSchemes(resourceManager);
    setResourceManager(resourceManager);

    let rc = new ResourceLinkContext();
    setResourceLinkCtx(rc);
    rc.onLinkClicked((e) => onLinkOpened?.(e.link, e.target));

    let papi = new PageAPI(rc, rootURL);
    setPageAPI(papi);

    let wm = new WM(false);
    wm.contexts = getAllContexts();
    setWM(wm);

    let diagContainer = $state<DialogContainer>();
    $effect(() => {
        if (diagContainer) {
            papi.dialogManager = diagContainer.getManager();
        }
    });

    onMount(() => {
        onReady?.(papi, resourceManager);
    });
</script>

<DialogContainer bind:this={diagContainer} />
{@render children?.()}
