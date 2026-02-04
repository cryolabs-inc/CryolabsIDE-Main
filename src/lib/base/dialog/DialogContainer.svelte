<svelte:options runes />

<script lang="ts">
    import Dialog from "$lib/components/ui/dialog/dialog.svelte";
    import DialogContent from "$lib/components/ui/dialog/dialog-content.svelte";
    import DialogHeader from "$lib/components/ui/dialog/dialog-header.svelte";
    import DialogFooter from "$lib/components/ui/dialog/dialog-footer.svelte";
    import DialogDescription from "$lib/components/ui/dialog/dialog-description.svelte";
    import DialogTitle from "$lib/components/ui/dialog/dialog-title.svelte";
    import Button from "$lib/components/ui/button/button.svelte";
    import { Input } from "$lib/components/ui/input";
    import { DialogManagerImpl, setDialogManager, type DialogState, type DialogStore } from "./DialogManagerImpl";
    import type { AutocompleteSuggestion, DialogOptions, PromptOptions } from "./DialogManager";

    async function updateSuggestions(dialog: DialogState, value: string) {
        const opts = dialog.options as PromptOptions;
        if (!opts.autocomplete) {
            dialog.suggestions = [];
            dialog.showSuggestions = false;
            return;
        }

        const suggestions = await opts.autocomplete.getSuggestions(value);
        dialog.suggestions = suggestions;
        dialog.showSuggestions = suggestions.length > 0;
        dialog.selectedSuggestionIndex = -1;
    }

    function selectSuggestion(dialog: DialogState, suggestion: AutocompleteSuggestion) {
        dialog.inputValue = suggestion.value;
        dialog.showSuggestions = false;
        dialog.suggestions = [];
    }

    function handleKeydown(e: KeyboardEvent, dialog: DialogState) {
        if (!dialog.showSuggestions || !dialog.suggestions?.length) return;

        const idx = dialog.selectedSuggestionIndex ?? -1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            dialog.selectedSuggestionIndex = Math.min(idx + 1, dialog.suggestions.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            dialog.selectedSuggestionIndex = Math.max(idx - 1, -1);
        } else if (e.key === 'Enter' && idx >= 0) {
            e.preventDefault();
            selectSuggestion(dialog, dialog.suggestions[idx]);
        } else if (e.key === 'Escape') {
            dialog.showSuggestions = false;
        }
    }

    let dialogs = $state<DialogState[]>([]);

    const store: DialogStore = {
        get dialogs() { return dialogs; },
        add(dialog: DialogState) {
            dialogs = [...dialogs, dialog];
        },
        remove(id: string) {
            dialogs = dialogs.filter(d => d.id !== id);
        },
        clear() {
            dialogs = [];
        },
        updateInput(id: string, value: string) {
            const dialog = dialogs.find(d => d.id === id);
            if (dialog) {
                dialog.inputValue = value;
            }
        }
    };

    const dialogManager = new DialogManagerImpl(store);
    setDialogManager(dialogManager);
    let errMsg = $state<string>("");
    export function getManager() {
        return dialogManager;
    }
</script>

{#each dialogs as dialog (dialog.id)}
    <Dialog bind:open={dialog.open} onOpenChange={(open) => {
        if (!open) {
            dialog.resolve(null);
            dialogManager.closeDialog(dialog.id);
        }
    }}>
        <DialogContent
            showCloseButton={dialog.type !== 'confirm' && (dialog.type !== 'custom' || (dialog.options as DialogOptions).closable !== false)}
            interactOutsideBehavior={dialog.type === 'confirm' ? 'ignore' : 'close'}
            modal={dialog.type !== 'custom' || (dialog.options as DialogOptions).modal !== false}
            class="top-[10%] translate-y-0"
        >
            {#if dialog.type === 'custom'}
                {@const opts = dialog.options as DialogOptions}
                <DialogHeader>
                    <DialogTitle>{@html opts.title}</DialogTitle>
                </DialogHeader>
                {#if typeof opts.content === 'string'}
                    <DialogDescription>{@html opts.content}</DialogDescription>
                {/if}
                {#if opts.buttons && opts.buttons.length > 0}
                    <DialogFooter>
                        {#each opts.buttons as button}
                            <Button
                                variant={button.variant === 'danger' ? 'destructive' : button.variant === 'secondary' ? 'secondary' : 'default'}
                                onclick={async () => {
                                    await button.action();
                                    if (opts.onClose) opts.onClose();
                                    dialogManager.closeDialog(dialog.id);
                                }}
                            >
                                {button.label}
                            </Button>
                        {/each}
                    </DialogFooter>
                {/if}

            {:else if dialog.type === 'prompt'}
                {@const opts = dialog.options as PromptOptions}
                <DialogHeader>
                    <DialogTitle>{@html opts.title}</DialogTitle>
                    <DialogDescription>{@html opts.message}</DialogDescription>
                </DialogHeader>
                <div class="relative">
                    <Input
                        type={opts.inputType ?? 'text'}
                        placeholder={opts.placeholder ?? ''}
                        value={dialog.inputValue ?? ''}
                        oninput={(e) => {
                            dialog.inputValue = e.currentTarget.value;
                            updateSuggestions(dialog, e.currentTarget.value);
                        }}
                        onkeydown={(e) => handleKeydown(e, dialog)}
                        onfocus={() => {
                            if (dialog.suggestions?.length) {
                                dialog.showSuggestions = true;
                            }
                        }}
                        onblur={() => {
                            // Delay to allow click on suggestion
                            setTimeout(() => { dialog.showSuggestions = false; }, 150);
                        }}
                        autocomplete="off"
                    />
                    {#if dialog.showSuggestions && dialog.suggestions?.length}
                        <div class="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {#each dialog.suggestions as suggestion, i}
                                <button
                                    type="button"
                                    class="w-full px-3 py-2 text-left hover:bg-accent cursor-pointer flex flex-col {dialog.selectedSuggestionIndex === i ? 'bg-accent' : ''}"
                                    onmousedown={() => selectSuggestion(dialog, suggestion)}
                                >
                                    <span class="font-medium">{suggestion.label ?? suggestion.value}</span>
                                    {#if suggestion.description}
                                        <span class="text-xs text-muted-foreground">{suggestion.description}</span>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <DialogFooter>
                    <Button variant="secondary" onclick={() => {
                        dialog.resolve(null);
                        dialogManager.closeDialog(dialog.id);
                    }}>
                        {opts.buttons?.cancel ?? 'Cancel'}
                    </Button>
                    <Button onclick={() => {
                        const value = dialog.inputValue ?? '';
                        if (opts.validation) {
                            const result = opts.validation(value);
                            if (typeof result === "boolean") {
                                
                            }
                            if (result !== true) return;
                        }
                        dialog.resolve(value);
                        dialogManager.closeDialog(dialog.id);
                    }}>
                        {opts.buttons?.confirm ?? 'OK'}
                    </Button>
                </DialogFooter>

            {:else if dialog.type === 'confirm'}
                {@const opts = dialog.options as { title: string; message: string }}
                <DialogHeader>
                    <DialogTitle>{@html opts.title}</DialogTitle>
                    <DialogDescription>{@html opts.message}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="secondary" onclick={() => {
                        dialog.resolve(false);
                        dialogManager.closeDialog(dialog.id);
                    }}>
                        Cancel
                    </Button>
                    <Button onclick={() => {
                        dialog.resolve(true);
                        dialogManager.closeDialog(dialog.id);
                    }}>
                        Confirm
                    </Button>
                </DialogFooter>

            {:else if dialog.type === 'alert'}
                {@const opts = dialog.options as { title: string; message: string }}
                <DialogHeader>
                    <DialogTitle>{opts.title}</DialogTitle>
                    <DialogDescription>{opts.message}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onclick={() => {
                        dialog.resolve(undefined);
                        dialogManager.closeDialog(dialog.id);
                    }}>
                        OK
                    </Button>
                </DialogFooter>
            {/if}
        </DialogContent>
    </Dialog>
{/each}
