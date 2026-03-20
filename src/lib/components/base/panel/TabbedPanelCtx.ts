import { Emitter } from "$lib/base/events";
import type { TypedEvent } from "$lib/base/events/events";
import { createContext } from "svelte";
export interface TabItem {
    id: string;
    name: string;
    objectURL: string;
    clickable: boolean;
    state: "loading"|"none"|"complete";
    closeEvent?: Emitter<void>;
}
export class TabContentsCtx<Tab = TabItem> {
    onBeforeClose: Emitter<void> = new Emitter();
    activeTab: Tab | null = null;
    close() {
        const res = this.onBeforeClose.emit();
        if (res)
            return;
        this.destroy();
    }
    destroy() {
        // implement this yourself
    }

}
const [get, set] =createContext < TabContentsCtx>();
export {get as getTabContents, set as setTabContentsCtx};