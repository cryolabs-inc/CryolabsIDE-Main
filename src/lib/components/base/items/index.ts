import type { Emitter } from "$lib/base/events";
export interface SelectionKey {
    newKeySelected: string;
}
export interface ItemGroupContext {
    onSelectionChanged: Emitter<SelectionKey>;
}