<script lang="ts">
  import { onMount, type ComponentProps, type Snippet } from "svelte";
  import { setTabContext, type ContextMenuItemDef, type TabContext, type TabContextDelegate } from ".";
  import Browser from "./Browser.svelte";
  import type { Variants } from "./apis/PageAPI";
  let {
    delegate,
    children
  }: {
    delegate: TabContextDelegate;
    children: Snippet;
  } = $props();
  class Context implements TabContext {
    onActivate(listener: () => void) {
      return this.delegate().onActivate?.(listener) ?? { dispose() {} };
    }
    async getBrowserVariant(): Promise<Variants> {
      return (await this.delegate()
        .getBrowserVariant()) ?? "light";
    }
    delegate: ()=>TabContextDelegate;
    constructor(delegate: ()=>TabContextDelegate) {
        this.delegate = delegate;
    }
    async navigate(newURL: string): Promise<void> {
      return this.delegate().updateOwnURL(newURL);
    }
    setTitle(title: string): void {
      this.delegate().updateOwnTitle(title);
    }
    setIcon(icon: string | undefined): void {
      this.delegate().updateOwnIcon(icon);
    }
    setState(state: "loading" | "none" | "complete"): void {
      this.delegate().updateOwnState(state);
    }
    setCloseable(closeable: boolean): void {
      this.delegate().updateOwnCloseable(closeable);
    }
    openTab(link: string): TabContext | null {
      return this.delegate().openTab(link);
    }
    get tab_id(): string {
        return this.delegate().tab_id;
    }
    close(): void {
      return this.delegate().closeTab();
    }
    setContextMenuItems(items: ContextMenuItemDef[]): void {
      this.delegate().setContextMenuItems(items);
    }
  }
  setTabContext(new Context(()=>delegate));
  onMount(() => {
    return () => {};
  });
</script>
{@render children()}