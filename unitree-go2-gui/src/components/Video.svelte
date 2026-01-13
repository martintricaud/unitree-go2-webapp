<script lang="ts">
    // The whole face landmarking detection logic is adapted from https://codepen.io/mediapipe-preview/pen/OJBVQJm
    import {
        FaceLandmarker,
        FilesetResolver,
        DrawingUtils,
        FaceDetector,
        ImageClassifier,
    } from '@mediapipe/tasks-vision';
    import { onMount } from 'svelte';
    import { videoFrame } from '../lib/webSocketClient';
    import type {
        NormalizedLandmark,
        Detection,
        BoundingBox,
        FaceDetectorResult,
    } from '@mediapipe/tasks-vision';

    export let faceLandmarksEnabled: boolean = true;
    export let faceDetectionEnabled: boolean = true;
    export let agePredictionEnabled: boolean = true;
    let canvas: HTMLCanvasElement;
    let liveView: HTMLElement;
    let ctx: CanvasRenderingContext2D;
    let faceLandmarker: FaceLandmarker | null = null;
    let faceDetector: FaceDetector | null = null;
    let agePredictor: ImageClassifier | null = null;
    let drawingUtils: DrawingUtils;
    let lastTs = 0;

    let cw, ch;
    // Keep a reference of all the child elements we create (for FaceDetection)so we can remove them easilly on each render.
    let children: HTMLElement[] = [];
    function initFaceDetection() {
        FilesetResolver.forVisionTasks('wasm')
            .then((resolver) =>
                FaceDetector.createFromOptions(resolver, {
                    baseOptions: {
                        modelAssetPath: `blaze_face_short_range.tflite`,
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                }),
            )
            .then((lm) => {
                faceDetector = lm;
            });
    }

    export function cropCanvasToBoundingBox(
        source: HTMLCanvasElement,
        box: BoundingBox,
    ): HTMLCanvasElement {
        const out = document.createElement('canvas');
        out.width = Math.round(box.width);
        out.height = Math.round(box.height);

        const ctx = out.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get 2D context');
        }

        ctx.drawImage(
            source,
            box.originX,
            box.originY,
            box.width,
            box.height,
            0,
            0,
            box.width,
            box.height,
        );

        return out;
    }
    // function initAgePrediction() {
    //     FilesetResolver.forVisionTasks('wasm')
    //         .then((resolver) =>
    //             FaceDetector.createFromOptions(resolver, {
    //                 baseOptions: {
    //                     modelAssetPath: 'model_lite_age_nonq.tflite',
    //                     delegate: 'GPU',
    //                 },
    //                 runningMode: 'VIDEO',
    //             }),
    //         )
    //         .then((lm) => {
    //             agePredictor = lm;
    //         });
    // }

    function initFaceLandmarker() {
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

    function drawFaceLandmarks(landmarkResults: NormalizedLandmark[][]) {
        for (const landmarks of landmarkResults) {
            drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
                color: '#C0C0C070',
                lineWidth: 1,
            });
            drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {
                color: '#FF3030',
            });
            drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, {
                color: '#FF3030',
            });
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
    }

    let landmarkDetectionResult;
    let faceDetectionResult: FaceDetectorResult = { detections: [] };

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        drawingUtils = new DrawingUtils(ctx);
        initFaceLandmarker();
        initFaceDetection();

        // Subscribe to the frame store
        const unsubscribe = videoFrame.subscribe((bitmap) => {
            if (!bitmap) return;
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const now = performance.now();
            if (now <= lastTs) return;
            lastTs = now;
            if (faceLandmarker && faceLandmarksEnabled) {
                landmarkDetectionResult = faceLandmarker.detectForVideo(canvas, now);
                if (!landmarkDetectionResult.faceLandmarks) return;
                drawFaceLandmarks(landmarkDetectionResult.faceLandmarks);
            }
            if (faceDetector && faceDetectionEnabled) {
                faceDetectionResult = faceDetector.detectForVideo(canvas, now);
                if (!faceDetectionResult.detections) return;
                // if (agePredictionEnabled) {
                //     for(let detection of result2.detections){
                //         let face = cropCanvasToBoundingBox(ctx, detection.boundingBox)
                //     }
                // }
            }
        });

        return () => unsubscribe();
    });
</script>

<div class="container">
    <canvas
        bind:this={canvas}
        width="1280"
        height="720"
        bind:clientWidth={cw}
        bind:clientHeight={ch}
    >
    </canvas>
    <div bind:this={liveView} class="liveView" style="width: {cw}px;height: {ch}px;">
        {#if faceDetectionResult.detections && faceDetectionResult.detections.length > 0}
            {#each faceDetectionResult.detections as { boundingBox, categories, keypoints }}
                {#if boundingBox}
                    {@const { width, height, originX, originY } = boundingBox}
                    <!-- Prediction text -->
                    <p
                        class="prediction"
                        style="
                        color: blue;
                        left: {cw - width - originX}px;
                        top: {originY}px;
                        width: {width}px;"
                    >
                        Confidence: {Math.round((categories[0]?.score ?? 0) * 100)}%
                    </p>

                    <!-- Highlighter div -->
                    <div
                        style="
                    border: 2px solid blue;
                    left: {cw - width - originX}px;
                    top: {originY}px;
                    width: {width - 10}px;
                    height: {height}px;"
                        class="highlighter"
                    ></div>
                    <!-- Keypoints -->
                    {#each keypoints as keypoint}
                        <span
                            class="key-point"
                            style="top: {keypoint.y * ch - 3}px;
                        left: {cw - keypoint.x * cw - 3}px;
                        width: 6px; height: 6px;
                        background-color: red"
                        ></span>
                    {/each}
                {/if}
            {/each}
        {/if}
    </div>
</div>

<style>
    .prediction {
        position: absolute;
        color: white;
        z-index: 1;
    }
    .highlighter {
        position: absolute;
        z-index: 1;
    }
    .container {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: black;
    }

    .liveView {
        position: absolute;
    }
    .key-point {
        position: absolute;
        z-index: 1;
        width: 3px;
        height: 3px;
        border-radius: 50%;
        display: block;
    }
    canvas {
        aspect-ratio: 16/9;
        max-width: 100%;
        max-height: 100%;
        display: block;
        background-color: blue;
    }
</style>
