<script lang="ts">
  import { usePageAPI } from "$lib/components/base/panel/apis/PageAPI";
  import type { SrcControlGit } from "$lib/git";
  import { onMount } from "svelte";

  let {}: {} = $props();
  let pageApi = usePageAPI();
  let srcCtrlGit = $state<SrcControlGit>();
  let isTokenFailed = $state(false);
  let statusDiv = $state<HTMLDivElement>();

  function setStatus(statusType: "loading" | "error" | "success", status: string) {
    if (!statusDiv) return;
    statusDiv.innerHTML = status;
    statusDiv.style.color = statusType === "loading" ? "gray" : statusType === "error" ? "red" : "green";
  }

  let ghLink = $state<{ repo: string; owner: string; branch?: string }>();

  onMount(async () => {
    ghLink = (await pageApi.fileconfig).github_link;

    const git = await pageApi.getGitManager();
    if (!git) {
      isTokenFailed = true;
      return;
    }

    if (ghLink) {
      git.setOwner(ghLink.owner);
      git.setRepo(ghLink.repo);
    }
    srcCtrlGit = git;
  });
</script>

<div class="p-1 w-full h-full">
  <p class="text-xl">Source control</p>
  {#if isTokenFailed}
    No Token has been entered. You need to enter a token.
  {:else if !srcCtrlGit}
    <p>Loading content...</p>
  {:else if ghLink}
    <p>
      Linked to: {ghLink.owner}/{ghLink.repo}
      <a
        href="javascript:void(0);"
        onclick={async () => {
          const repoFullName = await pageApi.dialogManager!.showPrompt({
            title: "Change Repository",
            message: "Search for a GitHub repository to link",
            placeholder: "owner/repo or search...",
            defaultValue: `${ghLink!.owner}/${ghLink!.repo}`,
            autocomplete: srcCtrlGit!.getRepoAutocomplete(),
          });

          if (repoFullName) {
            const [owner, repo] = repoFullName.split("/");
            if (owner && repo) {
              ghLink = { owner, repo };
              srcCtrlGit!.setOwner(owner);
              srcCtrlGit!.setRepo(repo);
            }
          }
        }}>(edit)</a
      >
    </p>

    <button
      class="border-2 border-white rounded bg-accent text-foreground"
      onclick={async (e) => {
        if (srcCtrlGit) {
          let sp = await pageApi.dialogManager!.showPrompt({
            title: "Enter in commit message",
            message: "A commit message is required before you can push the commit",
          });
          if (!sp) {
            setStatus("error", "No commit message provided");
            return;
          }
          setStatus("loading", "Pushing repository...");
          srcCtrlGit.push(pageApi.rootPath, "main", sp).then(() => {
            setStatus("success", "Successfully pushed repository.");
          });
        }
      }}>Push</button
    >
    <button
      class="border-2 border-white rounded bg-accent text-foreground"
      onclick={() => {
        if (srcCtrlGit) {
          srcCtrlGit.pull(
            pageApi.rootPath,
            ghLink?.branch ?? "main",
            undefined,
            (title, message) => pageApi.dialogManager!.confirm(title, message),
          );
        }
      }}>Pull</button
    >
    <div bind:this={statusDiv}></div>
  {:else}
    <p>
      You need to <a
        href="javascript:void(0);"
        onclick={async () => {
          const repoFullName = await pageApi.dialogManager!.showPrompt({
            title: "Link Repository",
            message: "Search for a GitHub repository to link",
            placeholder: "owner/repo or search...",
            autocomplete: srcCtrlGit!.getRepoAutocomplete(),
          });

          if (repoFullName) {
            const [owner, repo] = repoFullName.split("/");
            if (owner && repo) {
              ghLink = { owner, repo };
              srcCtrlGit!.setOwner(owner);
              srcCtrlGit!.setRepo(repo);
            }
          }
        }}>link with github</a
      >.
    </p>
  {/if}
</div>
