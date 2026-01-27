import type { Component, ComponentProps } from "svelte";

export class TreeItem<T extends Component<any, any, string> = Component> {
    label: string;
    icon?: T;
    iconProps?: ComponentProps<T>;
    tooltip: string;
    constructor(label: string, tooltip: string) {
        this.label = label;
        this.tooltip = tooltip;
    }
}
export interface TreeDataProvider<Dep> {
    getTreeItem(el: Dep): TreeItem;
    getChildren(el: Dep): Promise<Dep[]>;
    
}