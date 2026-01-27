import { Emitter } from "$lib/base/events";
import { createContext } from "svelte";
export interface TabItem {
    id: string;
    name: string;
    objectURL: string;
    clickable: boolean;
    state: "loading"|"none"|"complete";
}
export class TabContentsCtx<Tab = TabItem> {
    onBeforeClose: Emitter<void> = new Emitter();
    activeTab: Tab | null = null;
    close() {
        let res = this.onBeforeClose.emit();
        if (res)
            return;
        this.destroy();
    }
    destroy() {
        // implement this yourself
    }

}
let [get, set] =createContext < TabContentsCtx>();
export {get as getTabContents, set as setTabContentsCtx};