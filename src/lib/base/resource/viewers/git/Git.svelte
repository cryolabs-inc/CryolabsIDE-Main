<script lang="ts">
    import { Prefs } from "$lib/base/prefs";
    import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
    import Button from "$lib/components/ui/button/button.svelte";
    import type { SrcControlGit } from "$lib/git";
    import { onMount } from "svelte";
    import path from "path";

    let {}: {} = $props();
    let pageApi = usePageAPI();
    let srcCtrlGit = $state<SrcControlGit>();
    let signInNecessary = false;
    let ghLink = $state<{
        repo: string,
        owner: string
    }>();
    async function saveToFS() {
        let pn = new URL(pageApi.rootURL).pathname;
        let fc = await pageApi.fileconfig;
        fc.github_link = ghLink;
        await pageApi.setFileConfig(fc);
    }
    $effect(()=>{
        if (!ghLink) return;
        
        
         saveToFS();
    })
    onMount(async ()=>{
        if (!pageApi.dialogManager) return;
        ghLink = (await pageApi.fileconfig).github_link;
        let dm = pageApi.dialogManager;
        let ghToken = await Prefs.default()
            .get<string|undefined>("git.personal_access", undefined);
        if (!ghToken) {
            ghToken = (await dm.showPrompt({
                title: "Enter personal access tokens",
                message: "You will need to enter your personal access token. Use <a href=\"https://github.com/settings/tokens/new\" target=\"_blank\">this link</a>",
                validation(value) {
                    return value.startsWith("ghp_");
                },
                required: true
            }))!;

            await Prefs.default()
                .store('git.personal_access', ghToken);
        }
        
        srcCtrlGit = await pageApi.getFromPat(ghToken);
        
    })
</script>
<div class="p-1 w-full h-full">
    <p class="text-xl">Source control</p>
    {#if !srcCtrlGit}
    <p>Loading content...</p>
    {:else}
        {#if ghLink}
            <p>Linked to: {ghLink.owner}/{ghLink.repo}</p>
        {:else}
            <p>You need to <a href="javascript:void(0);" onclick={async () => {
                const repoFullName = await pageApi.dialogManager!.showPrompt({
                    title: "Link Repository",
                    message: "Search for a GitHub repository to link",
                    placeholder: "owner/repo or search...",
                    autocomplete: srcCtrlGit!.getRepoAutocomplete()
                });

                if (repoFullName) {
                    const [owner, repo] = repoFullName.split('/');
                    if (owner && repo) {
                        ghLink = { owner, repo };
                        srcCtrlGit!.setOwner(owner);
                        srcCtrlGit!.setRepo(repo);
                    }
                }
            }}>link with github</a>.</p>
        {/if}
    {/if}
</div>
