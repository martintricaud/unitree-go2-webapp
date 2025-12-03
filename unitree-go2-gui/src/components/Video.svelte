<script lang="ts">
    import { onMount } from 'svelte';
    import { videoFrame } from '../lib/webSocketClient';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;

    onMount(() => {
        ctx = canvas.getContext('2d')!;

        // Subscribe to the frame store
        const unsubscribe = videoFrame.subscribe((bitmap) => {
            if (!bitmap) return;
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        });

        return () => unsubscribe();
    });
</script>

<div class="container">
    <canvas bind:this={canvas}> </canvas>
</div>

<style>
    .container {
        display: flex;
        width: 100%;
        height: 100%;
       position: fixed;
        background-color: black;
          align-items: center;
    }   
    canvas {
        position: fixed;
      
        width: 100%;
        object-fit: contain; /* ensures aspect ratio is respected */
        background-color: blue;
    }
</style>
