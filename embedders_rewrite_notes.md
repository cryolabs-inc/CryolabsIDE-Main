# embedders.md rewrite checklist

## Structure / sections to cover

- [ ] What EmbedShell is and what it sets up internally
- [ ] Basic usage snippet (EmbedShell + Emulator + Browser)
- [ ] Emulator is manual / intentional — explain why (configurability)
- [ ] Props: rootURL, isReadonly, onLinkOpened, onReady
- [ ] onReady — THE entry point; shell has loaded and created a bare PageAPI context; without this you cannot use pageAPI at all
- [ ] Hammer onReady — mention it in the intro, in props, in its own section, and in every example. Reader should finish the doc knowing this is non-negotiable
- [ ] onAllLoaded — everything in the emulator is populated and ready; does NOT fire if the emulator fails to start
- [ ] pageAPI.fs is a promise — safer than onAllLoaded for most use cases since it resolves independently of boot success; prefer awaiting it directly
- [ ] Make the onReady vs onAllLoaded distinction crystal clear — common source of confusion
- [ ] Accessing PageAPI from child components via usePageAPI()
- [ ] PageAPI reference: fs, ext, openLink, commandRegistry, dialogManager, statusBar, registerViewMode, onAllLoaded, emulatorStarted, rootPath
- [ ] Custom resource handlers (SimpleResourceHandler, ResourceResponse, registerScheme)
- [ ] Registering commands (commandRegistry.register, keybindingHandler)
- [ ] Editor-only embed (doNotStartEmulator: true) — Emulator still required
- [ ] Multiple Browser targets
- [ ] Non-Svelte embedding not worth documenting yet — proper wrapper API planned for later
- [ ] Notes / gotchas (usePageAPI outside shell throws, etc.)

## Things to get right

- [ ] onReady vs onAllLoaded distinction is clear and front-and-center
- [ ] doNotStartEmulator behavior explained accurately (fs still mounts, onAllLoaded still fires)
- [ ] usePageAPI() — clarify it works inside shell children but NOT as a replacement for onReady for setup
- [ ] emulatorStarted vs onAllLoaded — explain the difference if both are documented
- [ ] Code snippets use pageAPI (not papi)
- [ ] All snippets are valid Svelte syntax
