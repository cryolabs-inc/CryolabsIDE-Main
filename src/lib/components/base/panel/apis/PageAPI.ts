import type { Disposable } from "$lib/base/disposable";
import { Emitter } from "$lib/base/events"
import type { TypedEvent } from "$lib/base/events/events";
import type { ResourceLinkContext } from "$lib/base/resourceCtx";
import type { FSProviderAPI } from "$lib/emulator/types";
import { ConstructExtendablePromise, type ExtendablePromise } from "$lib/utils";
import { createContext } from "svelte";

interface PTerminal {
    textEv: TypedEvent<string>;
    onResizeNeeded: TypedEvent<void>;
    write(data: string): void;
}
export interface Notification {

    title: string;
    label: string;
    progress?: {
        progressEmitter: Emitter<void>
    }
};
export interface NotificationWithID extends Notification {
    id: string;
}
export class StatusBar {
    notifications: NotificationWithID[] = [];
    onNotificationListChangedEmitter: Emitter<void> = new Emitter();
    addNotification(notif: Notification): Disposable {
        let notId = crypto.randomUUID();
        this.notifications.push({ id: notId, ...notif });
        this.onNotificationListChangedEmitter.emit();
        return {
            dispose: () => {

                this.notifications = this.notifications.filter(v => v.id !== notId);
                this.onNotificationListChangedEmitter.emit();
            },
        }
    }

}
export class PageAPI {
    readonly statusBar = new StatusBar();
    rc: ResourceLinkContext;
    constructor(rc: ResourceLinkContext) {
        this.rc = rc;
    }
    #onAllLoadedEmitter = new Emitter<void>();
    emitAllLoaded() {
        this.#onAllLoadedEmitter.emit();
    } 
    onAllLoaded = this.#onAllLoadedEmitter.event;
    #terminals: ({ id: string, term: PTerminal })[] = [];
    getTerminal(id: string) {
        return this.#terminals.filter(v => v.id === id)[0];
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
    fsPromise: ExtendablePromise<FSProviderAPI> = ConstructExtendablePromise();
    get fs() {
        return this.fsPromise.promise;
    }

}
export const [usePageAPI, setPageAPI] = createContext<PageAPI>();