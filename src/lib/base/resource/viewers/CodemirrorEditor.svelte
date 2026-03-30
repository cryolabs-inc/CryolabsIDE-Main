<script lang="ts">
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import * as monaco from "monaco-editor";
    import * as comlink from "comlink";
    import { onMount, type Component } from "svelte";
    import type { Disposable } from "$lib/base/disposable";
    import TooLarge from "./edit/TooLarge.svelte";
    import { cn } from "$lib/utils";
    import * as codemirror from 'codemirror';
    import { EditorState, type Extension } from "@codemirror/state";
    import {oneDark} from '@codemirror/theme-one-dark';
    import {serverCompletionSource, hoverTooltips, signatureHelp, LSPPlugin, languageServerSupport, serverCompletion} from '@codemirror/lsp-client';
    import Editor from "$lib/components/editor/Editor.svelte";
    import { autocompletion } from "@codemirror/autocomplete";
    import { cpp, cppLanguage } from "@codemirror/lang-cpp";
    let map = {
        cpp: []
    }
    type LF<T> =
        T extends Component<infer Props>
            ? {
                  component: T;
                  props: Props;
              }
            : never;
    interface LSPConfig {
        lang_id: string;
        lang_command: string;
        lang_args: string[];
        additional_extensions: Extension[]
    }
    let {
        value: value,
        onChangeContent = () => {},
        filePath,
        lsp_config
    }: {
        value: Blob;
        onChangeContent?: (newBuffer: Uint8Array) => void;
        filePath: string;
        lsp_config?: LSPConfig;
    } = $props();
    let div_element = $state<HTMLDivElement>();
    let page_api = usePageAPI();
    let texten = new TextEncoder();
    let textdec = new TextDecoder();
    onMount(() => {
        if (!div_element) return;

        let ev: codemirror.EditorView | undefined = undefined;
        let cancelled = false;

        // Mutable ref so the stored update listener always calls the current callback,
        // even after the view is remounted with a different onChangeContent prop.
        const callbackRef = { fn: onChangeContent };

        const ul = codemirror.EditorView.updateListener.of(async (viewUpdate) => {
            if (viewUpdate.docChanged) {
                try {
                    const nd = texten.encode(viewUpdate.state.doc.toString());
                    callbackRef.fn(nd);
                } catch {}
            }
        });

        const extArray = [ul, codemirror.basicSetup, oneDark];

        // Try to reuse a cached instance for this file path.
        const cached = page_api.codemirrorCache.acquire(filePath);
        if (cached) {
            ev = cached.view;
            // Point the stored ref at the current component's callback.
            cached.callbackRef.fn = onChangeContent;
            div_element.appendChild(ev.dom);
        } else {
            (async () => {
                let newView: codemirror.EditorView | undefined;

                if (!lsp_config) {
                    newView = new codemirror.EditorView({
                        parent: div_element,
                        doc: await value.text(),
                        extensions: [...extArray]
                    });
                } else {
                    await page_api.languageClients.defaultRegistered;
                    const lc = await page_api.languageClients.loadLanguageClient(filePath);
                    if (!lc) {
                        //TODO: show error page, language could not be identified
                        console.error("Language could not be identified.")
                        const sl = await page_api.languageClients.identifyLanguageId(filePath);
                        const newExtensions = [];
                        if (sl) newExtensions.push(sl.lang_extension);
                        newView = new codemirror.EditorView({
                            parent: div_element,
                            doc: await value.text(),
                            extensions: [...extArray, ...newExtensions]
                        });
                    } else {
                        // console.log([...extArray,  lc.plugin("file:///root"+filePath, lsp_config.lang_id)]);
                        newView = new codemirror.EditorView({
                            parent: div_element,
                            doc: await value.text(),
                            extensions: [...extArray, languageServerSupport(await lc.client, "file:///root"+filePath.substring("/user".length), lsp_config.lang_id), serverCompletion(), lc.lang_extension]
                        });
                    }
                }

                if (cancelled) {
                    newView?.destroy();
                    return;
                }

                ev = newView;
                if (newView) page_api.codemirrorCache.store(filePath, newView, callbackRef);
            })();
        }

        return () => {
            cancelled = true;
            if (ev) {
                // Detach from DOM and release back to cache to start TTL.
                ev.dom.remove();
                page_api.codemirrorCache.release(filePath);
            }
        };
    });
</script>

<div class="codemirror-wrapper h-full w-full" bind:this={div_element}></div>

<style>
    .codemirror-wrapper :global(.cm-editor) {
        height: 100%;
    }
</style>
