<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
    import TooltipProvider from '$lib/components/ui/tooltip/tooltip-provider.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<TooltipProvider>
{@render children()}
</TooltipProvider>