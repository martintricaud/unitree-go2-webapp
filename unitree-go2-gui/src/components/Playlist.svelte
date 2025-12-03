<script lang="ts">
    import { Button, Pane } from 'svelte-tweakpane-ui';
    // Vite: import as URL so <audio> / new Audio() works
    const files = import.meta.glob('/src/assets/audio/*', {
        eager: true,
        as: 'url',
    });

    // Turn the object into an array we can iterate over
    const audioList = Object.entries(files).map(([path, url]) => ({
        name: path.split('/').pop(),
        url,
    }));

    function play(url: string) {
        new Audio(url).play();
    }
</script>

<div class="div4">
    <Pane position="inline" title="Audio">
        {#each audioList as file}
            <Button title={file.name} on:click={() => play(file.url)} />
        {/each}
    </Pane>
</div>
