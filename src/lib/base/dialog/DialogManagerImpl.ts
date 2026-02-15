import { createContext } from "svelte";
import type { AutocompleteSuggestion, Dialog, DialogManager, DialogOptions, PromptOptions } from "./DialogManager";

export interface DialogState {
    id: string;
    type: 'custom' | 'prompt' | 'confirm' | 'alert';
    options: DialogOptions | PromptOptions | { title: string; message: string };
    open: boolean;
    resolve: (value: any) => void;
    inputValue?: string;
    suggestions?: AutocompleteSuggestion[];
    showSuggestions?: boolean;
    selectedSuggestionIndex?: number;
}

export type DialogStore = {
    dialogs: DialogState[];
    add: (dialog: DialogState) => void;
    remove: (id: string) => void;
    clear: () => void;
    updateInput: (id: string, value: string) => void;
};

function generateId(): string {
    return `dialog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export class DialogManagerImpl implements DialogManager {
    private store: DialogStore;

    constructor(store: DialogStore) {
        this.store = store;
    }

    showDialog(options: DialogOptions): Promise<Dialog> {
        return new Promise((resolve) => {
            const id = generateId();
            const dialogState: DialogState = {
                id,
                type: 'custom',
                options,
                open: true,
                resolve: () => {
                    this.closeDialog(id);
                }
            };
            this.store.add(dialogState);

            const dialog: Dialog = {
                id,
                options,
                close: () => this.closeDialog(id)
            };
            resolve(dialog);
        });
    }

    showPrompt(options: PromptOptions): Promise<string | null> {
        return new Promise((resolve) => {
            const id = generateId();
            const dialogState: DialogState = {
                id,
                type: 'prompt',
                options,
                open: true,
                resolve,
                inputValue: options.defaultValue ?? ''
            };
            this.store.add(dialogState);
        });
    }

    confirm(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const id = generateId();
            const dialogState: DialogState = {
                id,
                type: 'confirm',
                options: { title, message },
                open: true,
                resolve
            };
            this.store.add(dialogState);
        });
    }

    alert(title: string, message: string): Promise<void> {
        return new Promise((resolve) => {
            const id = generateId();
            const dialogState: DialogState = {
                id,
                type: 'alert',
                options: { title, message },
                open: true,
                resolve
            };
            this.store.add(dialogState);
        });
    }

    closeDialog(id: string): void {
        this.store.remove(id);
    }

    closeAll(): void {
        this.store.dialogs.forEach(d => d.resolve(null));
        this.store.clear();
    }

    getOpenDialogs(): Dialog[] {
        return this.store.dialogs
            .filter(d => d.type === 'custom')
            .map(d => ({
                id: d.id,
                options: d.options as DialogOptions,
                close: () => this.closeDialog(d.id)
            }));
    }
}

export const [getDialogManager, setDialogManager] = createContext<DialogManager>();
