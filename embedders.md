# Embedding the Editor

`EmbedShell` is the component you use when you want to drop the editor into your own Svelte app. It sets up everything the editor needs internally — the filesystem, the dialog system, the command palette, the resource manager — and exposes a clean API so you can control it from the outside.

---

## Basic usage

```svelte
<script lang="ts">
    import { EmbedShell, Emulator, Browser } from "$lib/index";
</script>

<EmbedShell rootURL="file:///myproject/">
    <Emulator basePath="/emulator/" />
    <Browser target="default" /> <!-- target="default" for handling _blank -->
</EmbedShell>
```

`EmbedShell` does not render any UI of its own. You are responsible for placing `Browser` components (tab containers) and any other UI inside it. The `children` snippet is rendered inside the fully initialized context, so any child component can call `usePageAPI()` and get a working API.

**The `Emulator` component is not included automatically** — you must add it yourself inside `EmbedShell`. This is intentional: it lets you configure the emulator directly (disk images, memory, boot options, etc.) rather than being locked into defaults. If you only want the file editor without a running VM, simply omit the `Emulator` component entirely.

---

## Props

- **`rootURL`** — The URL that represents the root of the project the editor is working on. Usually a `file:///` URL pointing to a directory inside the virtual filesystem, for example `"file:///user/myproject"`. This is what `pageAPI.rootPath` resolves to. Defaults to `"file:///"`.

- **`isReadonly`** — Set to `true` to put the editor in read-only mode. Some features that require write access will be unavailable. Defaults to `false`.

- **`onLinkOpened`** — A callback that fires whenever something inside the editor calls `pageAPI.openLink(url, target)`. This is how you connect link navigation to your `Browser` components. The callback receives the `link` (URL string) and `target` (where it should open). In most cases you do not need this — `Browser` components subscribe to link events automatically. Use it if you need to intercept or route links yourself.

- **`onReady`** — **Critical.** A callback that fires once after the editor is mounted and the context is fully initialized. It receives the `PageAPI` instance and the `ResourceManager`. This is the required entry point for all embedder setup — registering custom resource handlers, registering commands, opening a default file, and any other initialization that must happen before the user interacts with the editor. Do not try to access `PageAPI` before `onReady` fires; the context is not ready.

---

## The `onReady` callback

`onReady` is the primary entry point for configuring the editor. It fires exactly once, after the shell has mounted and all internal systems (filesystem, dialog manager, resource manager, command registry) are initialized. The `PageAPI` and `ResourceManager` it receives are the live instances — anything you register here is immediately active.

**You must do all setup inside `onReady`.** Attempting to call `usePageAPI()` at module level or in a parent component before `onReady` will throw an Error, saying that the PageAPI is not in the context. Page APIs must be accesed through the onReady callback.

```svelte
<EmbedShell
    rootURL="file:///myproject/"
    onReady={(pageAPI, rm) => {
        // Register a custom URL scheme
        rm.registerScheme("myscheme", new MyHandler());

        // Register a command
        pageAPI.commandRegistry?.register({
            id: "open-dashboard",
            label: "Open Dashboard",
            action() { pageAPI.openLink("myscheme:///dashboard", "upper"); }
        });

        // Open a default file once the VM is ready
        pageAPI.onAllLoaded(() => {
            pageAPI.openLink("file:///myproject/README.md", "upper");
        });
    }}
>
    <Emulator basePath="/emulator/" />
    <Browser target="upper" />
</EmbedShell>
```

The signature is:

```ts
onReady: (pageAPI: PageAPI, resourceManager: ResourceManager) => void
```

---

## The `onAllLoaded` callback

`pageAPI.onAllLoaded(callback)` fires once the `Emulator` has finished its setup — the filesystem is mounted and, if the emulator is configured to boot, Linux has fully started. It is the earliest safe point to read or write files, spawn processes via `pageAPI.ext`, or open resources that depend on the filesystem.

The two phases to understand:

- **`onReady`** — The editor shell is up. `PageAPI` exists. Register schemes, commands, and handlers here. The filesystem is **not** ready yet.
- **`onAllLoaded`** — The emulator has finished. The filesystem is **ready**. Open files, run startup scripts, write initial content here.

```ts
onReady={(pageAPI, rm) => {
    rm.registerScheme("myscheme", new MyHandler()); // safe here

    pageAPI.onAllLoaded(() => {
        // filesystem is ready — safe to read/write files and open links
        pageAPI.openLink("file:///myproject/README.md", "upper");
    });
}}
```

If `doNotStartEmulator` is set, `onAllLoaded` still fires after the filesystem is mounted — the callback does not require a fully booted VM, only a ready filesystem.

---

## Accessing PageAPI from children

Any Svelte component rendered inside `EmbedShell` can access the live API:

```svelte
<script lang="ts">
    import { usePageAPI } from "$lib/index";
    const pageAPI = usePageAPI();
</script>
```

---

## PageAPI — what you can do with it

`PageAPI` is the main interface between your embedder code and the editor internals. You get it via `onReady` or `usePageAPI()`.

- **`pageAPI.fs`** — A promise that resolves to the `FSProviderAPI`, the virtual filesystem. Awaiting this gives you full read/write access to files inside the emulator.

- **`pageAPI.ext`** — A promise that resolves to the `ExtensionAPI`, which lets you open processes inside the VM (shells, compilers, language servers, etc.).

- **`pageAPI.openLink(url, target)`** — Navigate to a URL in a Browser. `target` is the string ID of the Browser you want it to open in. Common targets: `"upper"`, `"tabs_lower"`. Use `"_blank"` to open in any available Browser.

- **`pageAPI.commandRegistry`** — The `CommandRegistry` instance. Call `.register({ id, label, description, action, keybindingHandler })` to add commands to the command palette (Ctrl+Shift+P). The `keybindingHandler` field is optional — if provided it receives every `keydown` event and should return `true` when it wants to capture and run the command.

- **`pageAPI.dialogManager`** — Access to the dialog system. Call `.showPrompt(...)`, `.confirm(...)`, `.alert(...)`, or `.showFilePicker(...)` to show built-in dialogs.

- **`pageAPI.statusBar`** — Add notifications to the status bar via `.addNotification({ title, label, kind, progress })`.

- **`pageAPI.registerViewMode(viewMode, callback)`** — Register a custom panel type. When a resource with a matching view mode is opened, your callback receives the request and returns a `ResourceResponse`.

- **`pageAPI.onAllLoaded(callback)`** — Fires once when the `Emulator` has finished setting up the filesystem and, if configured to boot, has completed the full Linux boot sequence. This is the earliest point at which `pageAPI.fs` and `pageAPI.ext` are usable and files can be read or written. If `doNotStartEmulator` is set, it still fires — just without a running VM. Use this to open a default file, write initial content, or start a process.

- **`pageAPI.emulatorStarted`** — An `ExtendablePromise<boolean>` that resolves with `true` if the VM booted or `false` if `doNotStartEmulator` was set.

- **`pageAPI.rootPath`** — The pathname portion of `rootURL`, e.g. `"/user/myproject"`.

---

## Adding a custom resource handler

Resource handlers let you teach the editor how to open URLs with custom schemes.

```ts
import { SimpleResourceHandler, ResourceResponse } from "$lib/index";

class MyHandler extends SimpleResourceHandler {
    async doRetrpanel(request: Request) {
        return ResourceResponse.ok("panel", {
            component: MyComponent,
            props: { url: request.url }
        });
    }
}

// register in onReady:
onReady={(pageAPI, rm) => {
    rm.registerScheme("myscheme", new MyHandler());
}}
```

Then `pageAPI.openLink("myscheme:///anything", "upper")` will open `MyComponent` as a tab.

---

## Registering commands

```ts
onReady={(pageAPI) => {
    pageAPI.commandRegistry?.register({
        id: "my-command",
        label: "Do something",
        description: "Opens a panel",
        keybindingHandler: (e) => e.ctrlKey && e.key === "m",
        action() {
            pageAPI.openLink("myscheme:///panel", "upper");
        }
    });
}}
```

---

## Example: editor-only embed (no VM)

If you just want the file editor without booting Linux, you still have to use the `Emulator` component, but you need to pass a configuration in to not start the emulator. This sets up the filesystem, but does not boot the emulator.

```svelte
<EmbedShell rootURL="file:///myproject/">
    <Emulator basePath="/" emulatorConfig={{doNotStartEmulator: true}} />
    <Browser target="default" />
</EmbedShell>
```

The dialog system, command palette, and resource manager are still fully available — only the filesystem and terminal (which depend on the VM) will not be accessible.

---

## Notes

- `EmbedShell` must wrap all components that call `usePageAPI()`, `useResourceLinkCtx()`, or `getResourceManager()`. Calling these outside the shell will throw a context error.
- You can have multiple `Browser` components inside a single `EmbedShell` with different `target` values. Links routed to a target only open in the `Browser` that matches that target.
- `EmbedShell` does not include an `Emulator` automatically. Add one inside the shell when you want a live filesystem and terminal, and configure it to suit your needs (disk images, memory, `basePath`, etc.).
