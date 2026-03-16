// ─── Shell ────────────────────────────────────────────────────────────────────
export { default as EmbedShell } from "./components/base/EmbedShell.svelte";
export {default as Emulator} from './components/base/emulator/Emulator.svelte';

// ─── Resource system ──────────────────────────────────────────────────────────
export {
    ResourceManager,
    getResourceManager,
    setResourceManager,
    FileHandler,
    FileTreePanelHandler,
    ResourceResponse,
    SimpleResourceHandler,
} from "./base/resource";

// ─── Page API ─────────────────────────────────────────────────────────────────
export { PageAPI, usePageAPI, setPageAPI, StatusBar } from "./components/base/panel/apis/PageAPI";
export type { Notification, NotificationWithID } from "./components/base/panel/apis/PageAPI";

// ─── Resource link context ────────────────────────────────────────────────────
export {
    ResourceLinkContext,
    useResourceLinkCtx,
    setResourceLinkCtx,
} from "./base/resourceCtx";

// ─── Window manager ───────────────────────────────────────────────────────────
export { WM, getWM, setWM } from "./components/base/windows/WM";

// ─── Browser (tab container) ──────────────────────────────────────────────────
export { default as Browser } from "./components/base/panel/Browser.svelte";

// ─── Status bar ───────────────────────────────────────────────────────────────
export { default as StatusBarComponent } from "./components/base/statusbar/StatusBar.svelte";

// ─── Preferences ─────────────────────────────────────────────────────────────
export { Prefs } from "./base/prefs";

// ─── Events ───────────────────────────────────────────────────────────────────
export { Emitter } from "./base/events";
export type { TypedEvent } from "./base/events/events";

// ─── Emulator types ───────────────────────────────────────────────────────────
export type { FSProviderAPI, ExtensionAPI, ConnectParams, WorkerHandlerAPI } from "./emulator/types";
