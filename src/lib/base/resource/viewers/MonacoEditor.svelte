<script lang="ts">
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import * as monaco from "monaco-editor";
    import * as comlink from "comlink";
    import { onMount, type Component } from "svelte";
    import type { Disposable } from "$lib/base/disposable";
    import TooLarge from "./edit/TooLarge.svelte";
    import { cn } from "$lib/utils";
    type LF<T> =
        T extends Component<infer Props>
            ? {
                  component: T;
                  props: Props;
              }
            : never;
    let {
        value: value,
        onChangeContent = () => {},
        filePath,
    }: {
        value: Blob;
        onChangeContent?: (newBuffer: Uint8Array) => void;
        filePath: string;
    } = $props();
    let dec = new TextDecoder();
    let enc = new TextEncoder();

    let divElem = $state<HTMLDivElement>();
    let papi = usePageAPI();
    let heuristicNeeded = $state(true);
    let heuristicAlert = $state<LF<any>>();
    onMount(() => {
        if (!divElem) return;
        if (value.size > 10 * 1024) {
            (async () => {
                heuristicNeeded = true;
                heuristicAlert = {
                    component: TooLarge,
                    props: {
                        fileBuffer: new Uint8Array(await value.arrayBuffer()),
                    },
                } as LF<typeof TooLarge>;
            })();
            return;
        }
        heuristicNeeded = false;
        let edit = monaco.editor.create(divElem, {
            language: value.type,
            automaticLayout: true,
            theme: "vs-dark",
            readOnly: !!papi.isEditorReadonly,
        });
        
        let watcher: Disposable | undefined = undefined;
        (async () => {
            
            let fsp = await papi.fs;
            let watcherId = await papi.watcherId;
            watcher = await fsp.watchForRefresh(
                comlink.proxy(async (fsChange) => {
                    if (fsChange.srcId === watcherId) {
                        return;
                    }
                    if (fsChange.path === filePath) {
                        edit.setValue(dec.decode(await fsp.readFile(filePath)));
                    }
                }),
            );
            let ab = await value.arrayBuffer();
            let u8 = new Uint8Array(ab);
                let vur = monaco.Uri.parse("file:///root"+filePath);
                
            let model = monaco.editor.getModel(vur) ?? monaco.editor.createModel(dec.decode(u8), undefined, vur);
            
            edit.setModel(model);
            if (model) {
            model.setEOL(monaco.editor.EndOfLineSequence.LF);
                
                model.onDidChangeContent((e) => {
                    if (!e.isFlush) {
                        model.setEOL(monaco.editor.EndOfLineSequence.LF);
                        let val = model.getValue();
                        onChangeContent(enc.encode(val));
                    }
                });
            }
            model?.setValue(dec.decode(u8));
        })();
        return () => {
            edit.dispose();
            watcher?.dispose();
        };
    });
</script>

    <div class={cn("h-full w-full hidden", !heuristicNeeded && "block")} bind:this={divElem}></div>
    {#if heuristicAlert}
    <heuristicAlert.component {...heuristicAlert.props}></heuristicAlert.component>
    <div>Checking file...</div>

    {/if}