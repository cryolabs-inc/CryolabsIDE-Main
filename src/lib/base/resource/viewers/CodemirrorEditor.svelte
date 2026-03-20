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
        let ul = codemirror.EditorView.updateListener.of(async (viewUpdate)=>{
            if (viewUpdate.docChanged) {
                try {
                    let fs = await page_api.fs;
                    let nd = texten.encode(viewUpdate.state.doc.toString());
                    onChangeContent(nd);
                    
                } catch {

                }
            }
        });
        
        let extArray = [ul, codemirror.basicSetup, oneDark];
        let ev: codemirror.EditorView|undefined = undefined;
        
        (async()=>{
           
            if (!lsp_config) {
               ev = new codemirror.EditorView({
                doc: await value.text(),
                extensions: [...extArray ]
            });
                return;
            }
            await page_api.languageClients.defaultRegistered;
            let lc = await page_api.languageClients.loadLanguageClient(filePath);
            if (!lc) {
                //TODO: show error page, language could not be identified
                console.error("Language could not be identified.")
                let sl = await page_api.languageClients.identifyLanguageId(filePath);
                let newExtensions = [];
                if (sl) {
                    newExtensions.push(sl.lang_extension);
                }
                ev = new codemirror.EditorView({
                    parent: div_element,
                    doc: await value.text(),
                    extensions: [...extArray, ...newExtensions]
                })
                return;
            }
            // console.log([...extArray,  lc.plugin("file:///root"+filePath, lsp_config.lang_id)]);
            ev = new codemirror.EditorView({
                parent: div_element,
                doc: await value.text(),
                extensions: [...extArray,languageServerSupport(await lc.client, "file:///root"+filePath.substring("/user".length), lsp_config.lang_id), serverCompletion(), lc.lang_extension]
            });
        })()
        return ()=>{
            ev?.destroy();
        }
    });
</script>

<div class="codemirror-wrapper h-full w-full" bind:this={div_element}></div>

<style>
    .codemirror-wrapper :global(.cm-editor) {
        height: 100%;
    }
</style>
