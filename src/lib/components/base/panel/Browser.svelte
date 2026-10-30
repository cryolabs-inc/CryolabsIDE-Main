<svelte:options runes />

<script lang="ts">
  import { findExistingFileTab } from "./fileTabs";
  import { getResourceManager } from "$lib/base/resource";
  import { Prefs } from "$lib/base/prefs";
  import { CircleAlertIcon, CircleDotIcon, Loader2Icon, SearchIcon, XIcon } from "@lucide/svelte";
  import DraggbleItemList from "../items/DraggbleItemList.svelte";
  import { mount, unmount, onMount, type Snippet } from "svelte";
  import { useResourceLinkCtx } from "$lib/base/resourceCtx";
  import path from "path-browserify";
  import type { TabItem } from "./TabbedPanelCtx";
  import { cn, ConstructExtendablePromise } from "$lib/utils";
  import ContextMenu from "$lib/components/ui/context-menu/context-menu.svelte";
  import ContextMenuTrigger from "$lib/components/ui/context-menu/context-menu-trigger.svelte";
  import ContextMenuContent from "$lib/components/ui/context-menu/context-menu-content.svelte";
  import ContextMenuItem from "$lib/components/ui/context-menu/context-menu-item.svelte";
  import ContextMenuSeparator from "$lib/components/ui/context-menu/context-menu-separator.svelte";
  import ContextMenuSub from "$lib/components/ui/context-menu/context-menu-sub.svelte";
  import ContextMenuSubTrigger from "$lib/components/ui/context-menu/context-menu-sub-trigger.svelte";
  import ContextMenuSubContent from "$lib/components/ui/context-menu/context-menu-sub-content.svelte";
  import { Emitter } from "$lib/base/events";
  import type { TabContext as ITabContext, TabContextDelegate, BrowserDelegate, ContextMenuItemDef } from ".";
  import { usePageAPI, type Variants } from "./apis/PageAPI";
  import TabContentsComponent, { type PanelResult } from "./TabContents.svelte";
  import Tooltip from "$lib/components/ui/tooltip/tooltip.svelte";
  import TooltipTrigger from "$lib/components/ui/tooltip/tooltip-trigger.svelte";
  import TooltipContent from "$lib/components/ui/tooltip/tooltip-content.svelte";

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
    delegate,
  }: {
    postTabs?: Snippet<[() => SerializableTabItem]>;
    target?: string;
    showTabs?: boolean;
    showAddressBar?: boolean;
    onNewTab?: () => TabItem;
    tabsDragDisabled?: boolean;
    homepage?: TabItem;
    delegate?: BrowserDelegate;
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

  // ── Tab content cache ──────────────────────────────────────────────────────
  // Plain Map — Svelte never observes it, no reactive circular-dep risk.
  type CachedTab = {
    instance: ReturnType<typeof mount>;
    el: HTMLDivElement;
    lastActiveAt: number;
    mountedURL: string;
  };
  const TAB_TTL_MS = 5 * 60 * 1000;
  const tabCache = new Map<string, CachedTab>();
  let containerEl: HTMLElement | undefined = $state(undefined);

  // Mount/show the active tab; detach (but keep alive) all others.
  $effect(() => {
    const tab = seled;
    if (!tab || !containerEl) return;

    const existing = tabCache.get(tab.id);
    // If the tab's URL changed since it was mounted, treat it as a navigation:
    // unmount the stale instance so it remounts fresh below.
    if (existing && existing.mountedURL !== tab.objectURL) {
      if (existing.el.parentElement) existing.el.parentElement.removeChild(existing.el);
      unmount(existing.instance);
      tabCache.delete(tab.id);
    }

    if (!tabCache.has(tab.id)) {
      const el = document.createElement("div");
      el.style.cssText = "width:100%;height:100%;";
      const instance = mount(TabContentsComponent, {
        target: el,
        props: { tabItem: tab, getPanel, delegate: new TCD(tab.id) },
      });
      tabCache.set(tab.id, { instance, el, lastActiveAt: Date.now(), mountedURL: tab.objectURL });
    } else {
      tabCache.get(tab.id)!.lastActiveAt = Date.now();
    }

    // Swap: detach all cached tabs from the container, then attach only the active one.
    for (const [id, cached] of tabCache) {
      if (id !== tab.id && cached.el.parentElement === containerEl) {
        containerEl.removeChild(cached.el);
      }
    }
    const active = tabCache.get(tab.id)!;
    if (!active.el.parentElement) {
      containerEl.appendChild(active.el);
    }
  });

  // When a tab is closed (removed from items), immediately unmount its cached instance.
  // tabCache is a plain Map so reading it here doesn't create a reactive dependency —
  // this effect only re-runs when `items` changes.
  $effect(() => {
    const currentIds = new Set(items.map((v) => v.id));
    currentIds.add("default"); // homepage is always valid
    for (const [id, cached] of tabCache) {
      if (!currentIds.has(id)) {
        if (cached.el.parentElement) cached.el.parentElement.removeChild(cached.el);
        unmount(cached.instance);
        tabCache.delete(id);
      }
    }
  });

  let extProm = ConstructExtendablePromise();
  onMount(() => {
    extProm.Resolve();

    const ttlInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, cached] of tabCache) {
        if (id !== selectedTabItem && now - cached.lastActiveAt > TAB_TTL_MS) {
          if (cached.el.parentElement) cached.el.parentElement.removeChild(cached.el);
          unmount(cached.instance);
          tabCache.delete(id);
        }
      }
    }, 30_000);

    return () => {
      clearInterval(ttlInterval);
      for (const [, cached] of tabCache) {
        if (cached.el.parentElement) cached.el.parentElement.removeChild(cached.el);
        unmount(cached.instance);
      }
      tabCache.clear();
      activeTabsChanged.dispose();
      tabListChanged.dispose();
      items.forEach((v) => {
        v.closeEvent?.emit();
      });
    };
  });

  let tabContextMenuItems: Record<string, ContextMenuItemDef[]> = $state({});

  let rctx = useResourceLinkCtx();

  export function tab_open(
    { link, target: linkTarget = target }: { link: string; target?: string },
    addANewOneEitherway: boolean = false,
  ) {
    if (linkTarget === "_never") {
      return;
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
      seled.name = ename;
      seled.objectURL = link;
      let seledIdx = items.findIndex((v) => v.id === selectedTabItem);
      items[seledIdx] = seled;
      return;
    }
    // File links should select the existing tab, including programmatic opens.
    const existingFileTab = findExistingFileTab(items, link);
    if (existingFileTab) {
      selectedTabItem = existingFileTab.id;
      return existingFileTab.id;
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
    if (new URL(link).protocol === "file:") {
      Prefs.default().get<({ path: string; isDir: boolean } | string)[]>("editor.recentFiles", []).then((recent) => {
        const filePath = new URL(link).pathname;
        const normalized = (recent ?? []).map(e => typeof e === "string" ? { path: e, isDir: false } : e);
        const updated = [{ path: filePath, isDir: false }, ...normalized.filter(e => e.path !== filePath)].slice(0, 20);
        Prefs.default().store("editor.recentFiles", updated);
      });
    }
    return newItem.id;
  }

  rctx.onLinkClicked((inp) => {
    tab_open(inp);
  });

  let rm = getResourceManager();

  async function getPanel(tab: TabItem): Promise<PanelResult> {
    await extProm.promise;
    tab.state = "loading";
    let resource = await rm.fetch(tab.objectURL, {
      method: "RETRPANEL",
    });
    tab.state = "complete";
    if (resource.resource && resource.resource.type === "panel") {
      return {
        kind: "component",
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
          return { kind: "html", content: stringData };
        }
        return { kind: "text", content: stringData };
      }
    }
    if (resource.status === 404) {
      return { kind: "404" };
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

  function closeTabById(id: string) {
    if (delegate?.onCloseTab(id)) return;
    const tab = items.find((v) => v.id === id);
    if (!tab) return;
    tab.closeEvent?.emit();
    let idx = items.findIndex((v) => v.id === id);
    if (idx === items.length - 1) idx--;
    items = items.filter((v) => v.id !== id);
    setTimeout(() => {
      if (items.length === 0) return;
      if (selectedTabItem !== id) {
        selectedTabItem = selectedTabItem;
        return;
      }
      selectedTabItem = items[Math.max(0, idx)].id;
    });
  }

  class BrowserTabContext implements ITabContext {
    #id: string;
    onActivate(listener: () => void) {
      return activeTabsChanged.event((tab) => {
        if (tab?.id === this.tab_id) listener();
      });
    }
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
    close(): void {
      closeTabById(this.#id);
    }
    setContextMenuItems(items: ContextMenuItemDef[]): void {
      tabContextMenuItems[this.#id] = items;
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
    onActivate(listener: () => void) {
      return activeTabsChanged.event((tab) => {
        if (tab?.id === this.tab_id) listener();
      });
    }
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
    closeTab(): void {
      closeTabById(this.tab_id);
    }
    setContextMenuItems(items: ContextMenuItemDef[]): void {
      tabContextMenuItems[this.tab_id] = items;
    }
  }
</script>

{#snippet MenuItems(menuItems: ContextMenuItemDef[])}
  {#each menuItems as item (item.id)}
    {#if item.separator}
      <ContextMenuSeparator />
    {/if}
    {#if item.children?.length}
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={item.disabled}>{item.label}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {@render MenuItems(item.children)}
        </ContextMenuSubContent>
      </ContextMenuSub>
    {:else}
      <ContextMenuItem onclick={item.action} disabled={item.disabled}>
        {item.label}
      </ContextMenuItem>
    {/if}
  {/each}
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
          {#if tabItem.state === "unsaved"} 
            <div class="p-0">
            <Tooltip>
            <TooltipTrigger>
              <CircleAlertIcon></CircleAlertIcon>
              </TooltipTrigger>
              <TooltipContent>
                  File is unsaved. Press ctrl-s to save
                </TooltipContent>
              </Tooltip>
            </div>
          {/if}
          {#if tabItem.state === "loading"}
            <div class="animate-spin">
              <Loader2Icon></Loader2Icon>
            </div>
          {/if}
          {#if tabItem.closeable !== false}
            <button
              onclick={() => closeTabById(tabItem.id)}
            >
              <XIcon class="hover:text-red-400 rounded cursor-pointer"></XIcon>
            </button>
          {/if}
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem>Drag out to new window</ContextMenuItem>
      {#if tabContextMenuItems[tabItem.id]?.length}
        <ContextMenuSeparator />
        {@render MenuItems(tabContextMenuItems[tabItem.id])}
      {/if}
    </ContextMenuContent>
  </ContextMenu>
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
    <div bind:this={containerEl} class="w-full h-full"></div>
  </diV>
</div>
