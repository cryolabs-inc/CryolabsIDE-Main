<svelte:options runes />

<script lang="ts">
    import * as Command from "$lib/components/ui/command";
    import { Input } from "$lib/components/ui/input";
    import { useCommandRegistry, type Command as COItem } from "./CommandRegistry.svelte";
    import { usePageAPI } from "../../components/base/panel/apis/PageAPI";

    const registry = useCommandRegistry();
    const pageAPI = usePageAPI();

    let open = $state(false);
    let query = $state("");
    let running = $state(false);

    let variantClass = $state(pageAPI.variant + "-cryolabs");

    $effect(() => {
        const disposable = pageAPI.onGlobalVariantChanged((newVariant) => {
            variantClass = newVariant + "-cryolabs";
        });
        return () => disposable.dispose();
    });


    async function runCommand(cmd: COItem) {
        running = true;
        await cmd.action();
        running = false;
        open = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
            e.preventDefault();
            open = !open;
            return;
        }

        for (const cmd of registry.commands) {
            if (cmd.keybindingHandler?.(e)) {
                e.preventDefault();
                e.stopPropagation();
                cmd.action();
                return;
            }
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<Command.Dialog bind:open class={variantClass + " bg-background text-foreground z-6000 "}>
  <Command.Input placeholder="Type a command or search..." />
  <Command.List>
    <Command.Empty>No results found.</Command.Empty>
    <Command.Group heading="Suggestions">
      {#each registry.commands as cmd (cmd.id)}
        <Command.Item onSelect={() => {
            running = true;
             Promise.resolve(cmd.action()).then(_=>{
                running = false;
                open = false;
             });
        }} disabled={running}>
          <div class="flex flex-col">
            <span>{cmd.label}</span>
            {#if cmd.description}
              <span class="text-xs text-muted-foreground">{cmd.description}</span>
            {/if}
          </div>
            {#if cmd.keybinding}

          <Command.Shortcut>
              {cmd.keybinding}
          </Command.Shortcut>
            {/if}

        </Command.Item>
      {/each}   
    </Command.Group>
  </Command.List>
</Command.Dialog>