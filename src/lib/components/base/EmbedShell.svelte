<script lang="ts">
    import { getAllContexts, onMount, type Snippet } from "svelte";
    import { ResourceManager, setResourceManager } from "$lib/base/resource";
    import { PageAPI, setPageAPI, type Variants } from "./panel/apis/PageAPI";
    import { ResourceLinkContext, setResourceLinkCtx } from "$lib/base/resourceCtx";
    import { setWM, WM } from "./windows/WM";
    import DialogContainer from "$lib/base/dialog/DialogContainer.svelte";
    import CommandPanel from "$lib/base/commands/CommandPanel.svelte";
    import { CommandRegistry, setCommandRegistry } from "$lib/base/commands/CommandRegistry.svelte";

    let {
        rootURL = "file:///",
        onLinkOpened,
        onReady,
        children,
        variant = "light",
        isReadonly = false
    }: {
        variant?: Variants
        /** Root URL passed to PageAPI (e.g. "file:///myproject/"). */
        rootURL?: string;
        isReadonly?: boolean; // If true, the PageAPI will be set up in read-only mode, which may cause some features to be unavailable. */
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

    let pageApi = new PageAPI(rc, rootURL, null,);
    setPageAPI(pageApi);

    let windowManager = new WM(false);
    windowManager.contexts = getAllContexts();
    setWM(windowManager);
    pageApi.variant = variant;
    $effect(()=>{
        pageApi.variant = variant;
    });
    pageApi.windows = windowManager;
    const commandRegistry = new CommandRegistry();
    setCommandRegistry(commandRegistry);
    pageApi.commandRegistry = commandRegistry;

    let dialogContainer = $state<DialogContainer>();
    $effect(() => {
        if (dialogContainer) {
            pageApi.dialogManager = dialogContainer.getManager();
        }
    });

    onMount(() => {
        onReady?.(pageApi, resourceManager);
    });
</script>

<DialogContainer  class="dark-cryolabs bg-background text-foreground" bind:this={dialogContainer} />
<CommandPanel />
{@render children?.()}
