import { Emitter } from "$lib/base/events";
import type { TypedEvent } from "$lib/base/events/events";
import { createContext, type Snippet } from "svelte";
export interface TabItem {
    id: string;
    name: string|(Snippet<[]>);
    objectURL: string;
    clickable: boolean;
    closeable?: boolean;
    state: "loading"|"none"|"complete";
    icon?: string;
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