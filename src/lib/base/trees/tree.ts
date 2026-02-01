import type { Component, ComponentProps } from "svelte";
export interface Action<T, TProps extends Record<string,any> = ComponentProps<Component>> {
    icon?: Component<TProps,any>;
    props?: TProps;
    label: string;
    callback: (treeDataProvider: TreeDataProvider<T>, treeItem: TreeItem, hbe: Event)=>void;
    id: string;
}
export class TreeItem<T extends Component<any, any, string> = Component> {
    label: string;
    icon?: T;
    iconProps?: ComponentProps<T>;
    tooltip: string;
    isHidden: boolean = false;
    link?: {href: string, target?: string};
    actions: Action< any>[] = [];
    prio: number = 0;
    constructor(label: string, tooltip: string) {
        this.label = label;
        this.tooltip = tooltip;
    }
}
export interface TreeDataProvider<Dep> {
    rootLabel?: string
    rootActions?: Action<Dep>[];
    getTreeItem(el: Dep): TreeItem;
    getChildren(el: Dep): Promise<Dep[]|null>;
    
}