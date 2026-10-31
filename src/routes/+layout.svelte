<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
    import { onMount } from 'svelte';
    import { dev } from '$app/environment';
    import { base } from '$app/paths';
    import TooltipProvider from '$lib/components/ui/tooltip/tooltip-provider.svelte';

	let { children } = $props();
    onMount(() => {
        if (!dev && 'serviceWorker' in navigator) {
            void navigator.serviceWorker.register(`${base}/sw.js`, { updateViaCache: 'none' })
                .catch(error => console.error('Service worker registration failed', error));
        }
    });
</script>

<svelte:head>
    <title>Cryolabs IDE</title>
    <link rel="icon" href={favicon} />
    <link rel="manifest" href={`${base}/manifest.webmanifest`} />
    <link rel="apple-touch-icon" href={`${base}/icons/apple-touch-icon.png`} />
    <meta name="theme-color" content="#0f172a" />
</svelte:head>
<TooltipProvider>
{@render children()}
</TooltipProvider>
