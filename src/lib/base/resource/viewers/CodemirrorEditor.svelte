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
    import {githubDark, githubLight} from '@uiw/codemirror-theme-github';
    import {serverCompletionSource, hoverTooltips, signatureHelp, LSPPlugin, languageServerSupport, serverCompletion} from '@codemirror/lsp-client';
    import Editor from "$lib/components/editor/Editor.svelte";
    import { acceptCompletion } from "@codemirror/autocomplete";
    import { indentMore } from "@codemirror/commands";
    import { keymap, Decoration, ViewPlugin, EditorView as EView } from "@codemirror/view";
    import { StateField, StateEffect } from "@codemirror/state";
    import { jumpToDefinition } from "@codemirror/lsp-client";
    import { cpp, cppLanguage } from "@codemirror/lang-cpp";
  import { getTabContext } from "$lib/components/base/panel";

    const setCtrlHover = StateEffect.define<{ from: number; to: number } | null>();

    const ctrlHoverField = StateField.define<ReturnType<typeof Decoration.none.map>>({
        create: () => Decoration.none,
        update(deco, tr) {
            deco = deco.map(tr.changes);
            for (const e of tr.effects) {
                if (e.is(setCtrlHover)) {
                    deco = e.value
                        ? Decoration.set([Decoration.mark({ class: "cm-ctrl-hover" }).range(e.value.from, e.value.to)])
                        : Decoration.none;
                }
            }
            return deco;
        },
        provide: (f) => EView.decorations.from(f),
    });

    const ctrlClickExtension = [
        ctrlHoverField,
        ViewPlugin.define((view) => {
            const clearHover = () => view.dispatch({ effects: setCtrlHover.of(null) });

            const onMouseMove = (e: MouseEvent) => {
                if (!e.ctrlKey && !e.metaKey) { clearHover(); return; }
                const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
                if (pos == null) { clearHover(); return; }
                const word = view.state.wordAt(pos);
                view.dispatch({ effects: setCtrlHover.of(word ? { from: word.from, to: word.to } : null) });
            };

            const onMouseDown = (e: MouseEvent) => {
                if (!e.ctrlKey && !e.metaKey) return;
                const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
                if (pos == null) return;
                e.preventDefault();
                view.dispatch({ selection: { anchor: pos }, effects: setCtrlHover.of(null) });
                jumpToDefinition(view);
            };

            const onKeyUp = (e: KeyboardEvent) => {
                if (e.key === "Control" || e.key === "Meta") clearHover();
            };

            view.dom.addEventListener("mousemove", onMouseMove);
            view.dom.addEventListener("mousedown", onMouseDown);
            window.addEventListener("keyup", onKeyUp);

            return {
                destroy() {
                    view.dom.removeEventListener("mousemove", onMouseMove);
                    view.dom.removeEventListener("mousedown", onMouseDown);
                    window.removeEventListener("keyup", onKeyUp);
                },
            };
        }),
    ];

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
        lsp_config,
        useCache = true,
        onDestroy = () => {}
    }: {
        value: Blob;
        onChangeContent?: (newBuffer: Uint8Array) => void;
        filePath: string;
        lsp_config?: LSPConfig;
        useCache?: boolean;
        onDestroy?: () => void;
    } = $props();
    let div_element = $state<HTMLDivElement>();
    let page_api = usePageAPI();
    let texten = new TextEncoder();
    let textdec = new TextDecoder();
    const tab_context = getTabContext();
    onMount(() => {
        if (!div_element) return;
         let ev: codemirror.EditorView | undefined = undefined;
        let cancelled = false;
        let watcher: Disposable | undefined = undefined;

(async()=>{
        let variant = await tab_context.getBrowserVariant();
       

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

        const tabKeymap = keymap.of([{
            key: "Tab",
            run: (view) => acceptCompletion(view) || indentMore(view),
        }]);

        const extArray = [tabKeymap, ...ctrlClickExtension, ul, codemirror.basicSetup,
            ViewPlugin.fromClass(class { destroy() { onDestroy(); } })];
        if (variant === "dark")
            extArray.push(githubDark);
        else if (variant === "light")
            extArray.push(githubLight)

        if (page_api.isEditorReadonly) {
            extArray.push(EditorState.readOnly.of(true));
        }
        // Try to reuse a cached instance for this file path.

        const cached = useCache ? page_api.codemirrorCache.acquire(filePath) : null;
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
                if (newView && useCache) page_api.codemirrorCache.store(filePath, newView, callbackRef);
            })();
        }

        const fsp = await page_api.fs;
        const watcherId = await page_api.watcherId;
        watcher = await fsp.watchForRefresh(
            comlink.proxy(async (fsChange) => {
                if (fsChange.srcId === watcherId) return;
                if (fsChange.path === filePath) {
                    const newContent = textdec.decode(await fsp.readFile(filePath));
                    ev?.dispatch({
                        changes: { from: 0, to: ev.state.doc.length, insert: newContent },
                    });
                }
            }),
        );
    })();
        return () => {
            cancelled = true;
            watcher?.dispose();
            if (ev) {
                ev.dom.remove();
                if (useCache) page_api.codemirrorCache.release(filePath);
                else ev.destroy();
            }
        };
    });
</script>

<div class="codemirror-wrapper h-full w-full" bind:this={div_element}></div>

<style>
    .codemirror-wrapper :global(.cm-editor) {
        height: 100%;
    }
    .codemirror-wrapper :global(.cm-ctrl-hover) {
        text-decoration: underline;
        cursor: pointer;
    }
</style>
