import { createContext, mount, unmount } from "svelte";
import Browser from "../panel/Browser.svelte";
import Window from "./Window.svelte";
import { GripIcon } from "@lucide/svelte";

export class WM {
    contexts?: Map<any, any>;
    rootElement: HTMLElement = document.body;
    minimizedWindowElement: HTMLElement;
    taskbarDragging: boolean = false;
    makeDraggable(draggableDiv: HTMLDivElement, handle: HTMLDivElement = draggableDiv, delay: number=0) {
        handle.onmousedown = (startEvent) => {
            let domRect = draggableDiv.getBoundingClientRect();
            let offsetX = startEvent.clientX - domRect.left;
            let offsetY = startEvent.clientY - domRect.top;
            let id = setTimeout(() => {
                function onMouseMove(e: MouseEvent) {
                    draggableDiv.style.left = `${e.clientX - offsetX}px`;
                    draggableDiv.style.top = `${e.clientY - offsetY}px`;
                    e.preventDefault();
                }
                function onMouseUp(e: MouseEvent) {
                    document.body.style.userSelect = 'auto';
                    e.preventDefault();
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                }
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
                document.body.style.userSelect = 'none';
            }, delay);
            window.onmouseup = (e) => {
                clearTimeout(id);
            }
        }
    }
    constructor() {
        let d = document.createElement('div');
        d.style.display = "flex";
        d.style.flexDirection = "row-reverse";
        d.style.gap = "20pt";
        d.style.padding = "2pt";
        d.style.position = "absolute";
        d.style.top = "90vh"
        d.classList.add('bg-accent');
        let dragHandle = document.createElement('div');
        dragHandle.style.display = "block";
        mount(GripIcon, { target: dragHandle });
        d.appendChild(dragHandle);
        this.rootElement.appendChild(d);
        this.minimizedWindowElement = d;
        this.makeDraggable(d, dragHandle);

    }
    launchWindow(url: string, { contexts, openMode, ...rest }: {
        contexts?: Map<any, any> | undefined,
        openMode: "default" | "position",
        position?: {
            X: number, Y: number
        }
    } = { openMode: "default" }) {
        let draggableDiv = document.createElement('div');
        contexts ??= this.contexts;
        let thiz = this;
        function maximize() {
            draggableDiv.classList.add('maximizing');
            draggableDiv.addEventListener('animationend', (e) => {
                draggableDiv.classList.remove('minimizing');
                draggableDiv.classList.remove('maximizing');
            }, { once: true });
        }
        let px = mount(Window, {
            props: {
                "showAddressBar": false,
                showTabs: false,
                onLoaded(browser) {
                    browser.tab_open({ link: url, target: "_blank" }, true);
                },
                class: "bg-background",
                async close() {
                    await unmount(px, { outro: true }); // unmounts are recursive.

                    draggableDiv.remove();
                },
                async minimize() {
                    draggableDiv.classList.add("minimizing");
                    let px = document.createElement('button');
                    px.innerHTML = "1";
                    thiz.minimizedWindowElement.appendChild(px);
                    px.onclick = (e) => {
                        maximize();
                        thiz.minimizedWindowElement.removeChild(px);
                    }
                }
            },
            target: draggableDiv,
            context: contexts,

        });
        // console.log(px.getBrowser());
        // px.getBrowser()?.tab_open({ link: url }, true);

        let initX = 0, initY = 0;
        if (openMode === "default") {
            initX = 20;
            initY = 20;
        }
        else {
            if (!rest.position) {
                throw new Error("Said you would put a position, but you didn't.");
            }
            initX = rest.position.X;
            initY = rest.position.Y;
        }
        draggableDiv.style.resize = "both";
        draggableDiv.style.width = "300px";
        draggableDiv.style.height = "300px";
        draggableDiv.style.overflow = "hidden";
        this.makeDraggable(draggableDiv, draggableDiv.querySelector('.toolbar-win') as HTMLDivElement, 100);
        draggableDiv.style.position = "absolute";
        draggableDiv.style.left = `${initX}px`;
        draggableDiv.style.top = `${initY}px`;
        draggableDiv.style.border = "2px solid var(--accent)"
        this.rootElement.appendChild(draggableDiv);

    }
}
export const [getWM, setWM] = createContext<WM>();