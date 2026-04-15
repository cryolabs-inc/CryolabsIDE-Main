<script lang="ts">
    import { onMount } from "svelte";
    import { Prefs } from "$lib/base/prefs";
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import * as comlink from "comlink";
  import { getTabContext } from "$lib/components/base/panel";

    type EditorMode = "codemirror" | "monaco";
    const SettingsIcon1 = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings-icon lucide-settings"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>`;
    let papi = usePageAPI();
    let updating = $state(false);
    const tabsContext = getTabContext();
    async function updateDisk() {
        updating = true;
        await papi.ext.then(v => v.update(comlink.proxy(() => {})));
        updating = false;
    }

    let editorMode = $state<EditorMode>("codemirror");
    let closeOnExit = $state(false);
    let loaded = $state(false);
    let saving = $state(false);

    onMount(async () => {
        editorMode = (await Prefs.default().get<EditorMode>("editor.mode", "codemirror")) ?? "codemirror";
        const termSettings = await papi.globalTerminalSettings;
        closeOnExit = termSettings.closeOnExit;
        loaded = true;
        tabsContext.setTitle(SettingsIcon1 + " IDE Settings");
    });

    async function setEditorMode(mode: EditorMode) {
        if (editorMode === mode) return;
        editorMode = mode;
        saving = true;
        await Prefs.default().store("editor.mode", mode);
        saving = false;
    }

    async function setCloseOnExit(value: boolean) {
        closeOnExit = value;
        await papi.setTerminalSettings({ closeOnExit: value });
    }
</script>

<div class="h-full w-full overflow-y-auto bg-gray-950 text-white">
    <div class="max-w-2xl mx-auto p-6">
        <h1 class="text-lg font-semibold mb-6 text-white">Settings</h1>

        <section class="mb-8">
            <h2 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">System</h2>
            <button
                onclick={updateDisk}
                disabled={updating}
                class="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:border-gray-600 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {updating ? "Updating..." : "Update Disk"}
            </button>
        </section>

        <section class="mb-8">
            <h2 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Terminal</h2>

            {#if !loaded}
                <div class="text-sm text-gray-500">Loading...</div>
            {:else}
                <div class="space-y-2">
                    <button
                        onclick={() => setCloseOnExit(false)}
                        class="w-full text-left p-4 rounded-lg border transition-colors {!closeOnExit
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-gray-700 bg-gray-900 hover:border-gray-600'}"
                    >
                        <div class="flex items-center justify-between gap-4">
                            <div>
                                <div class="font-medium text-sm">Print exit code</div>
                                <div class="text-xs text-gray-400 mt-0.5">
                                    When a process exits, print its exit code to the terminal. White for success, red for failure.
                                </div>
                            </div>
                            <div class="w-4 h-4 rounded-full shrink-0 border {!closeOnExit ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}"></div>
                        </div>
                    </button>

                    <button
                        onclick={() => setCloseOnExit(true)}
                        class="w-full text-left p-4 rounded-lg border transition-colors {closeOnExit
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-gray-700 bg-gray-900 hover:border-gray-600'}"
                    >
                        <div class="flex items-center justify-between gap-4">
                            <div>
                                <div class="font-medium text-sm">Close tab on exit</div>
                                <div class="text-xs text-gray-400 mt-0.5">
                                    Automatically close the terminal tab when the process exits.
                                </div>
                            </div>
                            <div class="w-4 h-4 rounded-full shrink-0 border {closeOnExit ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}"></div>
                        </div>
                    </button>
                </div>
            {/if}
        </section>

        <section class="mb-8">
            <h2 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Editor</h2>

            {#if !loaded}
                <div class="text-sm text-gray-500">Loading...</div>
            {:else}
                <div class="space-y-2">
                    <button
                        onclick={() => setEditorMode("codemirror")}
                        class="w-full text-left p-4 rounded-lg border transition-colors {editorMode === 'codemirror'
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-gray-700 bg-gray-900 hover:border-gray-600'}"
                    >
                        <div class="flex items-center justify-between gap-4">
                            <div>
                                <div class="font-medium text-sm">CodeMirror</div>
                                <div class="text-xs text-gray-400 mt-0.5">
                                    Editor with full LSP support. Higher memory usage due to in-browser language server. Meant for standard use. If tab is using too much memory, use Monaco Editor instead.
                                </div>
                            </div>
                            <div
                                class="w-4 h-4 rounded-full shrink-0 border {editorMode === 'codemirror'
                                    ? 'bg-blue-500 border-blue-500'
                                    : 'border-gray-600'}"
                            ></div>
                        </div>
                    </button>

                    <button
                        onclick={() => setEditorMode("monaco")}
                        class="w-full text-left p-4 rounded-lg border transition-colors {editorMode === 'monaco'
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-gray-700 bg-gray-900 hover:border-gray-600'}"
                    >
                        <div class="flex items-center justify-between gap-4">
                            <div>
                                <div class="font-medium text-sm">Monaco</div>
                                <div class="text-xs text-gray-400 mt-0.5">
                                    Minimal monaco editor. Used
                                    automatically as a fallback when disk download fails.
                                </div>
                            </div>
                            <div
                                class="w-4 h-4 rounded-full shrink-0 border {editorMode === 'monaco'
                                    ? 'bg-blue-500 border-blue-500'
                                    : 'border-gray-600'}"
                            ></div>
                        </div>
                    </button>
                </div>

                <div class="flex items-center gap-2 mt-3">
                    <p class="text-xs text-gray-500">Changes apply when the next file is opened.</p>
                    {#if saving}
                        <p class="text-xs text-blue-400">Saving...</p>
                    {/if}
                </div>
            {/if}
        </section>
    </div>
</div>
