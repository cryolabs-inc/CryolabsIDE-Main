<script lang="ts">
    import { onMount } from "svelte";
    import { Prefs } from "$lib/base/prefs";

    type EditorMode = "codemirror" | "monaco";

    let editorMode = $state<EditorMode>("codemirror");
    let loaded = $state(false);
    let saving = $state(false);

    onMount(async () => {
        editorMode = (await Prefs.default().get<EditorMode>("editor.mode", "codemirror")) ?? "codemirror";
        loaded = true;
    });

    async function setEditorMode(mode: EditorMode) {
        if (editorMode === mode) return;
        editorMode = mode;
        saving = true;
        await Prefs.default().store("editor.mode", mode);
        saving = false;
    }
</script>

<div class="h-full w-full overflow-y-auto bg-gray-950 text-white">
    <div class="max-w-2xl mx-auto p-6">
        <h1 class="text-lg font-semibold mb-6 text-white">Settings</h1>

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
