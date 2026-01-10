export interface SidePanelItem<T> {
    id: string,
    tooltip: string,
    Icon: Component,
    clickable: boolean,
    panel?: Component<T>,
    props?: T
};