<script lang="ts">
    import { onMount } from "svelte";
    import { usePageAPI, type NotificationWithID } from "../panel/apis/PageAPI";
    import NotificationsList from "./NotificationsList.svelte";

    let papi = usePageAPI();
    let notifs: NotificationWithID[] = $state([]);
    let showNotifications = $state(false);

    onMount(() => {
        let dip = papi.statusBar.onNotificationListChangedEmitter.event(() => {
            notifs = papi.statusBar.notifications;
        });
        return ()=>{
            dip.dispose();
        }
    });

    function toggleNotifications() {
        showNotifications = !showNotifications;
    }

    function closeNotifications() {
        showNotifications = false;
    }
</script>

<div class="w-full  flex flex-row justify-between items-center px-2 bg-gray-800 text-white text-sm">
    <div class="flex-1"></div>
    <div class="flex items-center gap-2">
        <button
            disabled={notifs.length === 0}
            onclick={toggleNotifications}
            class="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
        >
            {#if notifs.length > 0}
                <div class="rounded-full w-2 h-2 bg-blue-500 animate-pulse"></div>
            {/if}
            <span>{notifs.length} notification{notifs.length !== 1 ? 's' : ''}</span>
        </button>
    </div>
</div>

<NotificationsList
    notifs={notifs}
    show={showNotifications}
    onClose={closeNotifications}
/>
