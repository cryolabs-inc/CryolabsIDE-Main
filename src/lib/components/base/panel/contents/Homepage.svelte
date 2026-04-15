<svelte:options runes />

<script lang="ts">
  import {
    FileIcon,
    FilesIcon,
    FolderOpenIcon,
    PlugIcon,
    TerminalIcon,
  } from "@lucide/svelte";
  import Link from "../../resource/Link.svelte";
  import { usePageAPI } from "../apis/PageAPI";
  import { ConstructPTYUrl } from "$lib/utils";
  import { onMount, type Component } from "svelte";
  import { Prefs } from "$lib/base/prefs";
  import Button from "$lib/components/ui/button/button.svelte";
  import Tooltip from "$lib/components/ui/tooltip/tooltip.svelte";
  import { TooltipTrigger } from "$lib/components/ui/tooltip";
  import TooltipContent from "$lib/components/ui/tooltip/tooltip-content.svelte";

  let papi = usePageAPI();
  const _rootPath = papi.rootPath.startsWith("/user") ? papi.rootPath.slice(5) : papi.rootPath;
  const bashUrl = ConstructPTYUrl("/bin/bash", ["-i"], "/root" + _rootPath, [["force_color_prompt", "yes"]]);

  interface RecentEntry { path: string; isDir: boolean; }

  function normalizeRecent(raw: (string | RecentEntry)[]): RecentEntry[] {
    return raw.map(v => typeof v === "string" ? { path: v, isDir: false } : v);
  }

  async function trackRecent(path: string, isDir: boolean) {
    const raw = await Prefs.default().get<(string | RecentEntry)[]>("editor.recentFiles", []);
    const existing = normalizeRecent(raw ?? []);
    const updated = [{ path, isDir }, ...existing.filter(e => e.path !== path)].slice(0, 20);
    await Prefs.default().store("editor.recentFiles", updated);
    recentFiles = updated;
  }

  const RECENT_VALIDATE_TTL_MS = 5 * 60 * 1000;

  async function validateRecentFiles(entries: RecentEntry[]): Promise<RecentEntry[]> {
    const fs = await papi.fs;
    const results = await Promise.all(
      entries.map(async (entry) => {
        try {
          const st = await fs.stat(entry.path);
          return { path: entry.path, isDir: st.isDirectory() };
        } catch {
          return null;
        }
      })
    );
    return results.filter((e): e is RecentEntry => e !== null);
  }

  let recentFiles = $state<RecentEntry[]>([]);

  onMount(async () => {
    const raw = await Prefs.default().get<(string | RecentEntry)[]>("editor.recentFiles", []);
    const entries = normalizeRecent(raw ?? []);

    const validatedAt = await Prefs.default().get<number>("editor.recentFiles.validatedAt", 0);
    if (Date.now() - (validatedAt ?? 0) > RECENT_VALIDATE_TTL_MS) {
      const validated = await validateRecentFiles(entries);
      await Prefs.default().store("editor.recentFiles", validated);
      await Prefs.default().store("editor.recentFiles.validatedAt", Date.now());
      recentFiles = validated;
    } else {
      recentFiles = entries;
    }
  });
  interface UserAction {
    id: string;
    label: string;
    icon: Component;
    tooltip?: string;
    onActionClicked(): void;
  }
  interface Section {
    id: string;
    label: string;
    userActions: UserAction[];
  }

  const leftActions: Section[] = $derived([
    {
      id: "start",
      label: "Start",
      userActions: [
        {
          id: "open-or-create",
          label: "Open or create file",
          icon: FilesIcon,
          tooltip: "Open or create a new file",
          onActionClicked() {
            openFilePicker();
          },
        },
        {
          id: "open-folder",
          label: "Open folder",
          icon: FolderOpenIcon,
          tooltip: "Open a folder in a new window",
          async onActionClicked() {
            const picked = await papi.showFilePicker({ rootDir: papi.rootPath, title: "Open Folder", mode: "directory", confirmOnClick: true });
            if (picked) {
              await trackRecent(picked, true);
              papi.delegate.openWithRootURI(picked);
            }
          },
        },
        {
          id: "start-new-terminal",
          label: "Start a new bash session",
          icon: TerminalIcon,
          tooltip: "Start a new bash session",
          onActionClicked() {
            papi.openLink(bashUrl, "tabs_lower");
          },
        },
      ],
    },
    {
      id: "devices",
      label: "Devices",
      userActions: [
        {
          id: "open-serial-console",
          label: "serial0",
          icon: PlugIcon,
          onActionClicked() {
            papi.openLink("term:///serial0", "tabs_lower");
          },
        },
      ],
    },
    {
      id: "recent-files",
      label: "Recent files",
      userActions: recentFiles.map(v => ({
        id: v.path,
        icon: v.isDir ? FolderOpenIcon : FileIcon,
        label: v.path.startsWith("/user") ? v.path.slice(5) : v.path,
        tooltip: (v.isDir ? "Open folder " : "Open file ") + v.path,
        onActionClicked() {
          if (v.isDir) {
            papi.delegate.openWithRootURI(v.path);
          } else {
            papi.openLink("file://" + v.path, "_blank");
          }
        },
      } as UserAction))
    }
  ]);

  async function openFilePicker() {
    const picked = await papi.showFilePicker({
      rootDir: papi.rootPath,
      title: "Open File",
      mode: "file",
      confirmOnClick: true,
    });
    if (picked) {
      papi.openLink("file://" + picked, "_blank");
    }
  }
</script>

<div class="w-full h-full p-20 flex flex-col gap-20">
  <div class="text-lg">Welcome to CryolabsIDE</div>

  <div class="grid grid-cols-2">
    {#each leftActions as section (section.id)}
      <div class="flex flex-col gap-2">
        <div class="text-lg text-foreground">{section.label}</div>
        <div class="flex flex-col">
          {#each section.userActions as action (action.id)}
          <Tooltip>
          <TooltipTrigger class="w-fit">
            <Button
              variant="link"
              class="flex flex-row justify-start items-start text-foreground/80 w-fit"
              onclick={() => action.onActionClicked()}
            >
              <action.icon class="w-4 h-4 shrink-0" />
              {action.label}
            </Button>
            </TooltipTrigger>
            <TooltipContent>
                {action.tooltip}
            </TooltipContent>
            </Tooltip>
          {/each}
        </div>
      </div>
    {/each}

    
  </div>
</div>
