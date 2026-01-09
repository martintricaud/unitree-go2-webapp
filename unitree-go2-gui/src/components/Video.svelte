<script lang="ts">
    // The whole face landmarking detection logic is adapted from https://codepen.io/mediapipe-preview/pen/OJBVQJm
    import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
    import { onMount } from 'svelte';
    import { videoFrame } from '../lib/webSocketClient';

    export let enabled: boolean = true;
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let faceLandmarker: FaceLandmarker | null = null;
    let drawingUtils: DrawingUtils;
    let lastTs = 0;
    function initFaceLandmarker() {
        // const wasmUrl = new URL('@mediapipe/tasks-vision/wasm', import.meta.url).toString();
        // console.log(wasmUrl)

        FilesetResolver.forVisionTasks('wasm')
            .then((resolver) =>
                FaceLandmarker.createFromOptions(resolver, {
                    baseOptions: {
                        modelAssetPath: 'face_landmarker.task',
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                    numFaces: 1,
                }),
            )
            .then((lm) => {
                faceLandmarker = lm;
            });
    }

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        drawingUtils = new DrawingUtils(ctx);
        initFaceLandmarker();

        // Subscribe to the frame store
        const unsubscribe = videoFrame.subscribe((bitmap) => {
            if (!bitmap) return;
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            if (!enabled || !faceLandmarker) return;
            const now = performance.now();
            if (now <= lastTs) return;
            lastTs = now;

            const result = faceLandmarker.detectForVideo(canvas, now);
            if (!result.faceLandmarks) return;

            for (const landmarks of result.faceLandmarks) {
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
                    color: '#C0C0C070',
                    lineWidth: 1,
                });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {
                    color: '#FF3030',
                });
                drawingUtils.drawConnectors(
                    landmarks,
                    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
                    { color: '#FF3030' },
                );
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, {
                    color: '#30FF30',
                });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, {
                    color: '#30FF30',
                });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
                    color: '#E0E0E0',
                });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, {
                    color: '#E0E0E0',
                });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, {
                    color: '#FF3030',
                });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, {
                    color: '#30FF30',
                });
            }
        });

        return () => unsubscribe();
    });
</script>

<div class="container">
    <canvas bind:this={canvas} width="1280" height="720"> </canvas>
</div>

<style>
    .container {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: black;
    }
    canvas {
        aspect-ratio: 16/9;
        max-width: 100%;
        max-height: 100%;
        display: block;
        background-color: blue;
    }
</style>
