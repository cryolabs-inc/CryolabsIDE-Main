<svelte:options runes />

<script lang="ts" module>
  import type { Component } from "svelte";

  export type PanelResult =
    | { kind: "component"; Comp: Component; props: any }
    | { kind: "html"; content: string }
    | { kind: "text"; content: string }
    | { kind: "404" }
    | null;
</script>

<script lang="ts">
  import TabContext from "./TabContext.svelte";
  import type { TabContextDelegate } from ".";
  import type { TabItem } from "./TabbedPanelCtx";

  let {
    tabItem,
    getPanel,
    delegate,
  }: {
    tabItem: TabItem;
    getPanel: (tab: TabItem) => Promise<PanelResult>;
    delegate: TabContextDelegate;
  } = $props();
</script>

{#snippet htmlContent(content: string)}
  {@html content}
{/snippet}
{#snippet textContent(content: string)}
  {content}
{/snippet}

<TabContext {delegate}>
  {#await getPanel(tabItem)}
    <div></div>
  {:then result}
    {#if result?.kind === "component"}
      <result.Comp onUnload={tabItem.closeEvent?.event} {...result.props} />
    {:else if result?.kind === "html"}
      {@render htmlContent(result.content)}
    {:else if result?.kind === "text"}
      {@render textContent(result.content)}
    {:else if result?.kind === "404"}
      <div>This content was not found.</div>
    {/if}
  {/await}
</TabContext>
