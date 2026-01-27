import type { Emitter } from "$lib/base/events"
import type { TypedEvent } from "$lib/base/events/events";
import type { ResourceLinkContext } from "$lib/base/resourceCtx";
import { createContext } from "svelte";

interface PTerminal {
    textEv: TypedEvent<string>;
    onResizeNeeded: TypedEvent<void>;
    write(data: string): void;
}
export class PageAPI {
    rc: ResourceLinkContext;
    constructor(rc: ResourceLinkContext) {
        this.rc = rc;
    }
    #terminals: ({id: string, term: PTerminal})[] = [];
    getTerminal(id: string) {
        return this.#terminals.filter(v=>v.id === id)[0];
    }
    addTerminal(id: string, term: PTerminal) {
        this.#terminals.push({
            id, term
        });
    }
    
    showTerminal(id: string) {
        this.openLink(`term:///${id}`, "tabs_lower");
    }
    openLink(link: string, target = "_blank") {
        this.rc.openLink(link, target);
    }
}
export const [usePageAPI, setPageAPI] = createContext<PageAPI>();