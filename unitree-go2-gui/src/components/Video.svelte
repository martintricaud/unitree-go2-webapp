<script lang="ts">
    // The whole face landmarking detection logic is adapted from https://codepen.io/mediapipe-preview/pen/OJBVQJm
    import {
        FaceLandmarker,
        FilesetResolver,
        DrawingUtils,
        FaceDetector,
    } from '@mediapipe/tasks-vision';
    import { onMount, onDestroy } from 'svelte';
    import { writable, derived } from 'svelte/store';
    import type { Writable } from 'svelte/store';
    import { videoFrame } from '../lib/stores/connection';
    import type {
        NormalizedLandmark,
        Detection,
        BoundingBox,
        FaceDetectorResult,
    } from '@mediapipe/tasks-vision';

    let webcamOn = false;
    let horizontalScale = -1;
    export let faceLandmarksEnabled: boolean = true;
    export let faceDetectionEnabled: boolean = true;
    let canvas: HTMLCanvasElement;
    let liveView: HTMLElement;
    let ctx: CanvasRenderingContext2D;

    let running = true;
    let reader: ReadableStreamDefaultReader<VideoFrame> | undefined;
    let stream: MediaStream | undefined;
    let video: HTMLVideoElement;
    let rafId: number;

    const cameraFrame = writable<ImageBitmap | null>(null);

    const aggregateFrameStore = derived([videoFrame, cameraFrame], ([videoFrame, cameraFrame]) => {
        return webcamOn ? cameraFrame : videoFrame;
    });

    let faceLandmarker: FaceLandmarker | null = null;
    let faceDetector: FaceDetector | null = null;
    let drawingUtils: DrawingUtils;
    let lastTs = 0;

    let cw, ch;

    function initFaceDetection() {
        FilesetResolver.forVisionTasks('wasm')
            .then((resolver) =>
                FaceDetector.createFromOptions(resolver, {
                    baseOptions: {
                        modelAssetPath: `blaze_face_short_range.tflite`,
                        // modelAssetPath: `face_detection_full_range_sparse.tflite`,
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                    minDetectionConfidence: 0.4, 
                }),
            )
            .then((lm) => {
                faceDetector = lm;
                faceDetector.setOptions({ })
            });
    }

    // let ageClassifier: ImageClassifier;
    // const createAgeClassifier = async () => {
    //     const vision = await FilesetResolver.forVisionTasks('wasm').then(
    //         (resolver) =>
    //             (ageClassifier = ImageClassifier.createFromOptions(resolver, {
    //                 baseOptions: {
    //                     modelAssetPath: 'model_lite_age_nonq.tflite',
    //                     delegate: 'GPU',
    //                 },
    //                 maxResults: 1,
    //                 runningMode: 'VIDEO',
                    
    //             })),
    //     );
    // };

    function initFaceLandmarker() {
        FilesetResolver.forVisionTasks('wasm')
            .then((resolver) =>
                FaceLandmarker.createFromOptions(resolver, {
                    baseOptions: {
                        modelAssetPath: 'face_landmarker.task',
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                    numFaces: 5,
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
    let faceDetectionResult: Writable<FaceDetectorResult> = writable({ detections: [] });
    let faces = derived(faceDetectionResult, ($faceDetectionResult) => {
        return $faceDetectionResult.detections.map((face) => {
            if (face.boundingBox === undefined) {
                return null;
            } else {
                return createImageBitmap(
                    canvas,
                    face.boundingBox.originX,
                    face.boundingBox.originY,
                    face.boundingBox.width,
                    face.boundingBox.height,
                );
            }
        });
    });
    onMount(() => {
        // Start webcam
        (async () => {
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
            });

            video = document.createElement('video');
            video.playsInline = true;
            video.muted = true;
            video.srcObject = stream;
            await video.play();

            const loop = async () => {
                if (!running) return;
                const bitmap = await createImageBitmap(video);
                cameraFrame.update((prev) => {
                    prev?.close();
                    return bitmap;
                });

                rafId = requestAnimationFrame(loop);
            };

            loop();
        })();

        //Initialize canvas and drawing utils
        ctx = canvas.getContext('2d')!;
        drawingUtils = new DrawingUtils(ctx);
        initFaceLandmarker();
        initFaceDetection();
        //createAgeClassifier();

        // Subscribe to the frame store
        const unsubscribe = aggregateFrameStore.subscribe((bitmap) => {
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
                // faceDetectionResult = faceDetector.detectForVideo(canvas, now);
                faceDetectionResult.set(faceDetector.detectForVideo(canvas, now));
                if (!$faceDetectionResult.detections) return;
                // if (agePredictionEnabled) {
                //     for(let detection of result2.detections){
                //         let face = cropCanvasToBoundingBox(ctx, detection.boundingBox)
                //     }
                // }
            }
        });

        return () => unsubscribe();
    });
    onDestroy(() => {
        running = false;
        cancelAnimationFrame(rafId);
        stream?.getTracks().forEach((t) => t.stop());

        cameraFrame.update((frame) => {
            frame?.close();
            return null;
        });
    });
</script>

<div class="container">
    <canvas
        bind:this={canvas}
        width="1280"
        height="720"
        bind:clientWidth={cw}
        bind:clientHeight={ch}
        style="-webkit-transform: scaleX({horizontalScale});
  transform: scaleX({horizontalScale});"
    >
    </canvas>
    <div bind:this={liveView} class="liveView" style="width: {cw}px;height: {ch}px;">
        {#if $faceDetectionResult.detections && $faceDetectionResult.detections.length > 0}
            {#each $faceDetectionResult.detections as { boundingBox, categories, keypoints }}
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
        overflow: hidden;
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
