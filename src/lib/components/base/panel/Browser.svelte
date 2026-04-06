<svelte:options runes />

<script lang="ts">
  import { getResourceManager } from "$lib/base/resource";
  import { Loader2Icon, SearchIcon, XIcon } from "@lucide/svelte";
  import DraggbleItemList from "../items/DraggbleItemList.svelte";
  import { onMount, type Component, type ComponentProps, type Snippet } from "svelte";
  import { useResourceLinkCtx } from "$lib/base/resourceCtx";
  import path from "path-browserify";
  import type { TabItem } from "./TabbedPanelCtx";
  import { cn, ConstructExtendablePromise } from "$lib/utils";
  import ContextMenu from "$lib/components/ui/context-menu/context-menu.svelte";
  import ContextMenuTrigger from "$lib/components/ui/context-menu/context-menu-trigger.svelte";
  import ContextMenuContent from "$lib/components/ui/context-menu/context-menu-content.svelte";
  import ContextMenuItem from "$lib/components/ui/context-menu/context-menu-item.svelte";
  import { Emitter } from "$lib/base/events";
  import type { TabContext as ITabContext, TabContextDelegate } from ".";
  import TabContext from "./TabContext.svelte";
  import { usePageAPI, type Variants } from "./apis/PageAPI";
  export type SerializableTabItem = Omit<TabItem, "closeEvent">;
  let {
    target = crypto.randomUUID(),
    showTabs = true,
    showAddressBar = false,
    onNewTab,
    tabsDragDisabled = false,
    homepage = {
      clickable: true,
      id: "default",
      name: "Default tab",
      objectURL: "about:blank",
      state: "loading",
    },
    postTabs,
  }: {
    postTabs?: Snippet<[() => SerializableTabItem]>;
    target?: string;
    showTabs?: boolean;
    showAddressBar?: boolean;
    onNewTab?: () => TabItem;
    tabsDragDisabled?: boolean;
    homepage?: TabItem;
  } = $props();
  const page_api = usePageAPI();
  let items: TabItem[] = $state<TabItem[]>([]);
  let selectedTabItem = $state<string>("default");
  let variant = $state(page_api.variant);

  $effect(() => {
    const disposable = page_api.onGlobalVariantChanged((newVariant) => {
      variant = newVariant as Variants;
    });
    return () => disposable.dispose();
  });

  let variantClasses = $derived.by(() => {
    switch (variant) {
      case "dark":
        return "dark-cryolabs";
      case "light":
      default:
        return "light-cryolabs";
    }
  });
  let seled = $derived.by<TabItem>(() => {
    if (items.length === 0) {
      return homepage;
    }
    return items.filter((v) => v.id === selectedTabItem)[0];
  });
  let activeTabsChanged = new Emitter<TabItem>();
  let tabListChanged = new Emitter<TabItem[]>();
  $effect(() => {
    activeTabsChanged.emit(seled);
  });
  $effect(() => {
    $state.snapshot(items);
    tabListChanged.emit(items);
  });

  let extProm = ConstructExtendablePromise();
  onMount(() => {
    extProm.Resolve();
    return () => {
      activeTabsChanged.dispose();
      tabListChanged.dispose();
      items.forEach((v) => {
        v.closeEvent?.emit();
      });
    };
  });
  let rctx = useResourceLinkCtx();
  export function tab_open(
    { link, target: linkTarget = target }: { link: string; target?: string },
    addANewOneEitherway: boolean = false,
  ) {
    if (linkTarget === "_never") {
      return; // do nothing. never open a tab here.
    }
    if (
      !linkTarget.startsWith("_") &&
      target !== linkTarget &&
      !addANewOneEitherway
    ) {
      return;
    }
    if (
      linkTarget.startsWith("_") &&
      target !== "default" &&
      !addANewOneEitherway
    ) {
      return;
    }
    if (target !== "_blank" && !addANewOneEitherway) {
    }
    let pname = new URL(link).pathname;
    let ename = path.basename(pname);
    if (linkTarget === "_self" && items.length > 0) {
      // just modify the current page.
      seled.name = ename;
      seled.objectURL = link;
      let seledIdx = items.findIndex((v) => v.id === selectedTabItem);
      items[seledIdx] = seled;
      return;
    }
    let closeEvent = new Emitter<void>();
    let newItem = {
      id: crypto.randomUUID(),
      name: ename,
      objectURL: link,
      clickable: true,
      state: "loading",
      closeEvent,
    } as TabItem;
    items.push(newItem);
    selectedTabItem = newItem.id;
    return newItem.id;
  }
  rctx.onLinkClicked((inp) => {
    tab_open(inp);
  });
  let rm = getResourceManager();

  async function getPanel(tab: TabItem): Promise<{
    snip?: Snippet<[any]>;
    Comp?: Component;
    props?: any;
    args?: any;
  } | null> {
    await extProm.promise;
    tab.state = "loading";
    let resource = await rm.fetch(tab.objectURL, {
      method: "RETRPANEL",
    });
    tab.state = "complete";
    if (resource.resource && resource.resource.type === "panel") {
      return {
        Comp: resource.resource.data.component,
        props: resource.resource.data.props,
      };
    }
    if (resource.resource && resource.resource.type === "data") {
      if (resource.resource.data.data) {
        let b = resource.resource.data.data;
        let stringData = new TextDecoder().decode(
          new Uint8Array(await b.arrayBuffer()),
        );

        if (b.type === "text/html") {
          return {
            snip: thtmlContent,
            args: stringData,
          };
        }
        return {
          snip: txtContent,
          args: stringData,
        };
      }
    }
    if (resource.status === 404) {
      return {
        snip: four04,
        args: undefined,
      };
    }
    return null;
  }
  export const tabs = () => {
    return [...$state.snapshot(items)];
  };
  export function updateTab(
    id: string,
    props: Partial<
      Pick<
        TabItem,
        "name" | "closeable" | "clickable" | "state" | "objectURL" | "icon"
      >
    >,
  ) {
    const idx = items.findIndex((v) => v.id === id);
    if (idx === -1) return;
    items[idx] = { ...items[idx], ...props };
  }
  export const serialize = () => {
    return {
      it: $state
        .snapshot(items)
        .filter((v) => v.objectURL.startsWith("file:///")),
      seledId: selectedTabItem,
    };
  };
  export const deserialize = (val: { it: TabItem[]; seledId: string }) => {
    if (val instanceof Array) {
      items = val;
      return;
    }
    items = val.it;
    selectedTabItem = val.seledId;
  };

  export const onActiveTabChanged = activeTabsChanged.event;
  export const onTabListChanged = tabListChanged.event;
  class BrowserTabContext implements ITabContext {
    #id: string;
    async getBrowserVariant() {
      return variant;
    }
    constructor(id: string) {
      this.#id = id;
    }
    get tab_id() {
      return this.#id;
    }
    async navigate(newURL: string): Promise<void> {
      updateTab(this.#id, { objectURL: newURL });
    }
    setTitle(title: string): void {
      updateTab(this.#id, { name: title });
    }
    setIcon(icon: string | undefined): void {
      updateTab(this.#id, { icon });
    }
    setState(state: "loading" | "none" | "complete"): void {
      updateTab(this.#id, { state });
    }
    setCloseable(closeable: boolean): void {
      updateTab(this.#id, { closeable });
    }
    openTab(link: string): ITabContext | null {
      return openTab(link);
    }
  }

  export function openTab(link: string): ITabContext | null {
    const id = tab_open({ link }, true);
    if (!id) return null;
    return new BrowserTabContext(id);
  }
  export function activeTab() {
    const { closeEvent, ...it } = items.filter(
      (v) => v.id === selectedTabItem,
    )[0];
    return $state.snapshot<SerializableTabItem>(it) as SerializableTabItem;
  }
  class TCD implements TabContextDelegate {
    async getBrowserVariant(): Promise<Variants> {
      return variant;
    }
    tab_id: string;
    constructor(tab_id: string) {
      this.tab_id = tab_id;
    }
    async updateOwnURL(newURL: string): Promise<void> {
      return new Promise((resolve) => {
        setTimeout(() => {
          updateTab(this.tab_id, { objectURL: newURL });
        }, 100);
        resolve();
      });
    }
    updateOwnTitle(title: string): void {
      updateTab(this.tab_id, { name: title });
    }
    updateOwnIcon(icon: string | undefined): void {
      updateTab(this.tab_id, { icon });
    }
    updateOwnState(state: "loading" | "none" | "complete"): void {
      updateTab(this.tab_id, { state });
    }
    updateOwnCloseable(closeable: boolean): void {
      updateTab(this.tab_id, { closeable });
    }
    openTab(link: string): ITabContext | null {
      return openTab(link);
    }
  }
</script>

{#snippet thtmlContent(content: string)}
  {@html content}
{/snippet}
{#snippet txtContent(content: string)}
  {content}
{/snippet}
{#snippet four04(arg: undefined)}
  <div>This content was not found.</div>
{/snippet}
{#snippet Tab(tabItem: TabItem)}
  <ContextMenu>
    <ContextMenuTrigger>
      <div class="  text-foreground p-2">
        <div class="flex justify-center gap-2">
          {#if typeof tabItem.name === "string"}
            {@html tabItem.name}
          {:else}
            {@render tabItem.name()}
          {/if}
          {#if tabItem.state === "loading"}
            <div class="animate-spin">
              <Loader2Icon></Loader2Icon>
            </div>
          {/if}
          {#if tabItem.closeable !== false}
            <button
              onclick={(e) => {
                tabItem.closeEvent?.emit();
                let idx = items.findIndex((v) => v.id === tabItem.id);
                if (idx >= 0 && idx < items.length) {
                  // don't change
                }
                if (idx === items.length - 1) {
                  // change
                  idx--;
                }

                items = items.filter((v) => v.id !== tabItem.id);
                if (selectedTabItem !== tabItem.id) {
                  // don't do anything.
                } else {
                  // console.log("new sel: " + items[idx].id);
                }
                setTimeout(() => {
                  if (items.length === 0) {
                    return;
                  }
                  if (selectedTabItem !== tabItem.id) {
                    // don't do anything.
                    selectedTabItem = selectedTabItem;
                  }
                  selectedTabItem = items[idx].id;
                });
              }}
            >
              <XIcon class="hover:text-red-400 rounded cursor-pointer"></XIcon>
            </button>
          {/if}
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem>Drag out to new window</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
{/snippet}
{#snippet TabContents(tabItem: TabItem)}
  <TabContext delegate={new TCD(tabItem.id)}>
    {#await getPanel(tabItem)}
      <div></div>
    {:then s}
      {#if s?.Comp}
        <s.Comp onUnload={tabItem.closeEvent?.event} {...s.props}></s.Comp>
      {/if}
      {#if s?.snip}
        {@render s.snip(s.args as any)}
      {/if}
    {/await}
  </TabContext>
{/snippet}
<div
  class={cn("flex w-full h-full flex-col relative bg-background text-foreground", variantClasses)}
>
  <div class="h-fit flex flex-row w-full justify-between">
    <div class="w-fit h-fit">
      {#if showTabs}
        <DraggbleItemList
          bind:items
          Comp={Tab}
          orientation="horizontal"
          bind:selected={selectedTabItem}
          dragDisabled={tabsDragDisabled}
          dndZoneProps={{ type: "tabs-upper" }}
          ondrop={(e) => {
            if (e.dataTransfer) {
              let textData = e.dataTransfer.getData("text");
              try {
                let parsed = JSON.parse(textData) as {
                  type: "url";
                  url: string;
                };
                if (parsed.type === "url") {
                  let u = new URL(parsed.url);
                  let fullURL = u.href;
                  tab_open({ link: fullURL });
                }
              } catch {}
            }
          }}
        ></DraggbleItemList>
      {/if}
    </div>
    <div class="w-fit h-full">
      {@render postTabs?.(activeTab)}
    </div>
  </div>

  <diV
    class="flex flex-col w-full h-full overflow-scroll"
    style="scrollbar-width: none"
  >
    {#if showAddressBar}
      <div class="w-full h-full">
        <SearchIcon class="absolute"></SearchIcon>
        <input
          class="border-none w-full focus-visible:outline-red-400 absolute"
          type="text"
        />
      </div>
    {/if}
    <div class="w-full h-full">
      {#if seled}
        {@render TabContents(seled)}
      {/if}
    </div>
  </diV>
</div>
