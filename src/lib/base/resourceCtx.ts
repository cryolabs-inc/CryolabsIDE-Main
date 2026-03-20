import { createContext, setContext } from "svelte";
import { Emitter } from "./events"
import type { TypedEvent } from "./events/events";

export class ResourceLinkContext {
    onLinkClicked: TypedEvent<{link: string, target: string}>;
    constructor() {
        const em = new Emitter<{ link: string, target: string }>();
        this.dispatchEventClicked = em.emit.bind(em);
        this.onLinkClicked = em.event.bind(em);
    }
    dispatchEventClicked({ link, target}: { link: string, target: string }) {
        throw new Error("Not initialized");
    }
    openLink(link: string, target: string) {
        this.dispatchEventClicked({link, target});
    }
}
const [get, set] = createContext<ResourceLinkContext>();
export {get as useResourceLinkCtx, set as setResourceLinkCtx}