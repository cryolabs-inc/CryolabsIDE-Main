import { createContext, mount, unmount } from "svelte";
import Browser from "../panel/Browser.svelte";
import Window from "./Window.svelte";
import { GripIcon } from "@lucide/svelte";

export class WM {
    contexts?: Map<any, any>;
    rootElement: HTMLElement = document.body;
    minimizedWindowElement: HTMLElement;
    taskbarDragging: boolean = false;
    makeResizable(draggableDiv: HTMLDivElement) {
        const EDGE = 6;
        type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | '';
        function getEdge(e: MouseEvent): Edge {
            const r = draggableDiv.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top;
            const n = y < EDGE, s = y > r.height - EDGE;
            const w = x < EDGE, east = x > r.width - EDGE;
            if (n && w) return 'nw'; if (n && east) return 'ne';
            if (s && w) return 'sw'; if (s && east) return 'se';
            if (n) return 'n'; if (s) return 's';
            if (w) return 'w'; if (east) return 'e';
            return '';
        }
        const cursorMap: Record<string, string> = {
            n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
            ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
        };
        draggableDiv.addEventListener('mousemove', (e) => {
            if ((e.target as HTMLElement) !== draggableDiv) {
                draggableDiv.style.cursor = '';
                return;
            }
            const edge = getEdge(e);
            draggableDiv.style.cursor = cursorMap[edge] || '';
        });
        draggableDiv.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement) !== draggableDiv) return;
            const edge = getEdge(e);
            if (!edge) return;
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX, startY = e.clientY;
            const rect = draggableDiv.getBoundingClientRect();
            const startW = rect.width, startH = rect.height;
            const startL = rect.left, startT = rect.top;
            function onMouseMove(e: MouseEvent) {
                const dx = e.clientX - startX, dy = e.clientY - startY;
                if (edge.includes('e')) draggableDiv.style.width = `${startW + dx}px`;
                if (edge.includes('w')) { draggableDiv.style.width = `${startW - dx}px`; draggableDiv.style.left = `${startL + dx}px`; }
                if (edge.includes('s')) draggableDiv.style.height = `${startH + dy}px`;
                if (edge.includes('n')) { draggableDiv.style.height = `${startH - dy}px`; draggableDiv.style.top = `${startT + dy}px`; }
                e.preventDefault();
            }
            function onMouseUp() {
                document.body.style.userSelect = 'auto';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            }
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }
    makeDraggable(draggableDiv: HTMLDivElement, handle: HTMLDivElement = draggableDiv, delay: number=0) {
        handle.onmousedown = (startEvent) => {
            const domRect = draggableDiv.getBoundingClientRect();
            const offsetX = startEvent.clientX - domRect.left;
            const offsetY = startEvent.clientY - domRect.top;
            const id = setTimeout(() => {
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
    constructor(showGrapple = true) {
        const d = document.createElement('div');
        d.style.display = "flex";
        d.style.flexDirection = "row-reverse";
        d.style.gap = "20pt";
        d.style.padding = "2pt";
        d.style.position = "absolute";
        d.style.top = "90vh"
        d.classList.add('bg-accent');
        const dragHandle = document.createElement('div');
        dragHandle.style.display = "block";
        mount(GripIcon, { target: dragHandle });
        d.appendChild(dragHandle);
        this.rootElement.appendChild(d);
        this.minimizedWindowElement = d;
        this.makeDraggable(d, dragHandle);
        if (!showGrapple) {
            d.style.display = "none";
        }

    }
    launchWindow(url: string, { contexts, openMode, ...rest }: {
        contexts?: Map<any, any> | undefined,
        openMode: "default" | "position",
        position?: {
            X: number, Y: number
        }
    } = { openMode: "default" }) {
        const draggableDiv = document.createElement('div');
        contexts ??= this.contexts;
        const thiz = this;
        let isMaximized = false;
        const savedRect = { left: '', top: '', width: '', height: '' };
        function maximize() {
            draggableDiv.classList.add('maximizing');
            draggableDiv.addEventListener('animationend', (e) => {
                draggableDiv.classList.remove('minimizing');
                draggableDiv.classList.remove('maximizing');
            }, { once: true });
        }
        function toggleMaximize() {
            if (!isMaximized) {
                savedRect.left = draggableDiv.style.left;
                savedRect.top = draggableDiv.style.top;
                savedRect.width = draggableDiv.style.width;
                savedRect.height = draggableDiv.style.height;
                draggableDiv.style.left = '0px';
                draggableDiv.style.top = '0px';
                draggableDiv.style.width = '100vw';
                draggableDiv.style.height = '100vh';
            } else {
                draggableDiv.style.left = savedRect.left;
                draggableDiv.style.top = savedRect.top;
                draggableDiv.style.width = savedRect.width;
                draggableDiv.style.height = savedRect.height;
            }
            isMaximized = !isMaximized;
        }
        const px = mount(Window, {
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
                    const px = document.createElement('button');
                    px.innerHTML = "1";
                    thiz.minimizedWindowElement.appendChild(px);
                    px.onclick = (e) => {
                        maximize();
                        thiz.minimizedWindowElement.removeChild(px);
                    }
                },
                maximize: toggleMaximize
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
        draggableDiv.style.width = "300px";
        draggableDiv.style.height = "300px";
        draggableDiv.style.overflow = "hidden";
        this.makeResizable(draggableDiv);
        this.makeDraggable(draggableDiv, draggableDiv.querySelector('.toolbar-win') as HTMLDivElement, 100);
        draggableDiv.style.position = "absolute";
        draggableDiv.style.zIndex = "99999";
        draggableDiv.style.left = `${initX}px`;
        draggableDiv.style.top = `${initY}px`;
        draggableDiv.style.border = "2px solid var(--accent)";
        draggableDiv.tabIndex = -1;
        draggableDiv.style.boxShadow = "none";
        draggableDiv.addEventListener('focusin', () => {
            draggableDiv.style.boxShadow = "0 12px 40px rgba(0, 0, 0, 0.55)";
        });
        draggableDiv.addEventListener('focusout', (e) => {
            if (!draggableDiv.contains(e.relatedTarget as Node)) {
                draggableDiv.style.boxShadow = "none";
            }
        });
        this.rootElement.appendChild(draggableDiv);

    }
}
export const [getWM, setWM] = createContext<WM>();