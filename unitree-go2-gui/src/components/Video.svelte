<script lang="ts">
    import { onMount } from "svelte";
    import { videoFrame } from "../lib/webSocketClient";

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;

    onMount(() => {
        ctx = canvas.getContext("2d")!;

        // Subscribe to the frame store
        const unsubscribe = videoFrame.subscribe((bitmap) => {
            if (!bitmap) return;
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        });

        return () => unsubscribe();
    });
</script>

<canvas bind:this={canvas} width="1280" height="720">   </canvas>
