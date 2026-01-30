<script lang="ts">
    import { defaultResourceFetch } from "$lib/base/resource";
    let {url}: {url: string} = $props();
    async function getPanel(objectURL: string) {
        

        let resource = await defaultResourceFetch(objectURL, {method: "RETRPANEL"});
        if (resource.resource && resource.resource.type === "panel") {
            return {
                Comp: resource.resource.data.component,
                props: resource.resource.data.props
            };
        }
        return null;
    };
</script>

{#await getPanel(url)}
    <div>Loading panel...</div>

{:then val}
    {#if val}
        <val.Comp {...val.props}></val.Comp>


    {:else}
    <div>Value not renderable</div>
    {/if}
{/await}