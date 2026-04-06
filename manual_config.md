# manual_config.yaml

This file lets you configure where the app downloads its emulator files from, and control how the emulator behaves. It is useful when you are self-hosting or serving files from a CDN (like Cloudflare R2) instead of the default server.

Create the file at `static/manual_config.yaml`. Every field is optional — you only need to include the ones you want to change.

---

## Fields

- **`emulator_base`** — The base URL where the small emulator files live (the BIOS files, the kernel, the WebAssembly binary, etc.). Think of this as the folder on your server that contains all the emulator assets. If you leave this out, the app looks for those files at the root of whatever server it is running on.

- **`disk_path`** — The full URL to the Linux disk image. This is the large file (~1 GB) that only needs to be downloaded once — after the first visit it is cached locally on the user's device and never downloaded again. Point this at wherever you are hosting the disk image, for example a Cloudflare R2 bucket. If you leave this out, the app will try to load it from `emulator_base` and print a warning in the browser console.

- **`bzimage_path`** — The full URL to the Linux kernel binary (`bzImage`, ~14 MB). Like the disk, this is downloaded once and cached. If you leave this out, the app will look for it at `emulator_base + "bzImage"`.

- **`initrd_path`** — The full URL to the initial ramdisk (`initrd`, ~13 MB). This is a small filesystem the kernel uses during early boot. Downloaded once and cached. If you leave this out, the app will look for it at `emulator_base + "initrd"`.

- **`do_not_start_emulator`** — Set this to `true` if you want the editor to load without booting a Linux VM. The filesystem and file editor will still work, but there will be no terminal and no running processes. This is useful if you are deploying the editor as a lightweight code viewer or file browser where a full Linux environment is not needed. Defaults to `false`.

---

## Example

This is what a typical config looks like when serving files from a CDN:

```yaml
# Base URL for small emulator assets (BIOS, kernel, wasm, etc.)
emulator_base: "https://assets.example.com/emulator/"

# Large files — serve these from wherever makes sense for your setup
disk_path: "https://assets.example.com/emulator/disk"
bzimage_path: "https://assets.example.com/emulator/bzImage"
initrd_path: "https://assets.example.com/emulator/initrd"

# Set to true to disable the VM entirely (editor-only mode)
do_not_start_emulator: false
```

---

## Notes

- All downloaded files are cached in the browser's private filesystem (OPFS). Users only pay the download cost once per device, even across sessions.
- The disk image is streamed and decompressed on the fly — the full uncompressed size never sits in RAM.
- To force a re-download of the kernel or initrd, bump their cache keys by deploying a file with a different name and updating the paths here.
