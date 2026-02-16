<script lang="ts">
    import { Portal } from "bits-ui";
    import type { NotificationWithID } from "../panel/apis/PageAPI";

    interface Props {
        notifs: NotificationWithID[];
        show: boolean;
        onClose: () => void;
    }

    let { notifs, show, onClose }: Props = $props();
</script>

{#if show}
    <Portal>
        <div class="fixed inset-0 z-50 flex items-end justify-end p-4">
            <!-- Backdrop to close notifications when clicking outside -->
            <button
                onclick={onClose}
                class="absolute inset-0 bg-black/20"
                aria-label="Close notifications"
            ></button>

            <!-- Notifications panel -->
            <div class="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-96 max-h-[80vh] overflow-hidden flex flex-col">
                <!-- Header -->
                <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                    <h3 class="text-white font-semibold">Notifications</h3>
                    <button
                        onclick={onClose}
                        class="text-gray-400 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <!-- Notifications list -->
                <div class="flex-1 overflow-y-auto">
                    {#each notifs as notif (notif.id)}
                        <div class="px-4 py-3 border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                            <div class="text-white font-medium mb-1">{notif.title}</div>
                            <div class="text-gray-400 text-sm">{notif.label}</div>
                            {#if notif.progress}
                                <div class="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full bg-blue-500 rounded-full transition-all duration-300" style="width: {notif.progress.percent ?? 0}%"></div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </Portal>
{/if}
