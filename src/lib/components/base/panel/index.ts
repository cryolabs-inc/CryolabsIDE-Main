import type { Browser } from "$lib";
import { createContext, type ComponentProps } from "svelte";
import type { Variants } from "./apis/PageAPI";

export interface TabContextDelegate {
    updateOwnURL(newURL: string): Promise<void>;
    updateOwnTitle(title: string): void;
    updateOwnIcon(icon: string | undefined): void;
    updateOwnState(state: "loading" | "none" | "complete"): void;
    updateOwnCloseable(closeable: boolean): void;
    openTab(link: string): TabContext | null;
    tab_id: string;
    getBrowserVariant(): Promise<NonNullable<Variants>>;
}
export interface TabContext {
    getBrowserVariant(): Promise<NonNullable<Variants>>;
    navigate(newURL: string): Promise<void>;
    setTitle(title: string): void;
    setIcon(icon: string | undefined): void;
    setState(state: "loading" | "none" | "complete"): void;
    setCloseable(closeable: boolean): void;
    openTab(link: string): TabContext | null;
    get tab_id(): string;
}
export const [getTabContext, setTabContext] = createContext<TabContext>();