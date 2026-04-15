import type { Browser } from "$lib";
import { createContext, type ComponentProps } from "svelte";
import type { Variants } from "./apis/PageAPI";

export type ContextMenuItemDef = {
    id: string;
    label: string;
    action?: () => void;
    disabled?: boolean;
    /** Render a separator before this item */
    separator?: boolean;
    /** If present, renders as a sub-menu trigger instead of a plain item */
    children?: ContextMenuItemDef[];
};

export interface BrowserDelegate {
    /** Called when a tab close is requested. Return `true` to prevent the default close behavior. */
    onCloseTab(tabId: string): boolean | void;
}

export interface TabContextDelegate {
    updateOwnURL(newURL: string): Promise<void>;
    updateOwnTitle(title: string): void;
    updateOwnIcon(icon: string | undefined): void;
    updateOwnState(state: "loading" | "none" | "complete"): void;
    updateOwnCloseable(closeable: boolean): void;
    openTab(link: string): TabContext | null;
    closeTab(): void;
    setContextMenuItems(items: ContextMenuItemDef[]): void;
    tab_id: string;
    getBrowserVariant(): Promise<NonNullable<Variants>>;
}
export interface TabContext {
    getBrowserVariant(): Promise<NonNullable<Variants>>;
    navigate(newURL: string): Promise<void>;
    setTitle(title: string): void;
    setIcon(icon: string | undefined): void;
    setState(state: "loading" | "none" | "complete"|"unsaved"): void;
    setCloseable(closeable: boolean): void;
    openTab(link: string): TabContext | null;
    close(): void;
    setContextMenuItems(items: ContextMenuItemDef[]): void;
    get tab_id(): string;
}
export const [getTabContext, setTabContext] = createContext<TabContext>();