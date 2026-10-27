<script lang="ts">
    // The whole face landmarking detection logic is adapted from https://codepen.io/mediapipe-preview/pen/OJBVQJm
    import {
        FaceLandmarker,
        FilesetResolver,
        DrawingUtils,
        FaceDetector,
    } from '@mediapipe/tasks-vision';
    import { onMount, onDestroy } from 'svelte';
    import { robot } from '../lib/stores/robot.svelte';
    import type {
        NormalizedLandmark,
        Detection,
        BoundingBox,
        FaceDetectorResult,
    } from '@mediapipe/tasks-vision';

    let webcamOn = false;
    let horizontalScale = -1;
    let props: {
        faceLandmarksEnabled: boolean;
        faceDetectionEnabled: boolean;
    } = $props();
    let canvas: HTMLCanvasElement;
    let liveView: HTMLElement;
    let ctx: CanvasRenderingContext2D;

    let running = true;
    let reader: ReadableStreamDefaultReader<VideoFrame> | undefined;
    let stream: MediaStream | undefined;
    let video: HTMLVideoElement;
    let rafId: number;

    let cameraFrame = $state.raw<ImageBitmap | null>(null);
    /// A new webcam frame closes the one it replaces, which nothing draws any more.
    const showCamera = (_bitmap: ImageBitmap | null) => {
        cameraFrame?.close();
        cameraFrame = _bitmap;
    };

    let faceLandmarker: FaceLandmarker | null = null;
    let faceDetector: FaceDetector | null = null;
    let drawingUtils: DrawingUtils;
    let lastTs = 0;

    let cw = $state(0);
    let ch = $state(0);

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
    let faceDetectionResult = $state.raw<FaceDetectorResult>({ detections: [] });
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
                showCamera(await createImageBitmap(video));

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
    });
    // Draws each new frame, the webcam's while it is on and otherwise the robot's, and runs the enabled
    // detections on it. Declared after `onMount`, which creates `ctx`, so it runs after it.
    $effect(() => {
        const shown = webcamOn ? cameraFrame : robot.frame;
        if (!shown) return;
        ctx.drawImage(shown, 0, 0, canvas.width, canvas.height);
        const now = performance.now();
        if (now <= lastTs) return;
        lastTs = now;
        if (faceLandmarker && props.faceLandmarksEnabled) {
            landmarkDetectionResult = faceLandmarker.detectForVideo(canvas, now);
            if (!landmarkDetectionResult.faceLandmarks) return;
            drawFaceLandmarks(landmarkDetectionResult.faceLandmarks);
        }
        if (faceDetector && props.faceDetectionEnabled) {
            // Written, never read, here: a read would make the effect re-run on its own write.
            faceDetectionResult = faceDetector.detectForVideo(canvas, now);
            // if (agePredictionEnabled) {
            //     for(let detection of result2.detections){
            //         let face = cropCanvasToBoundingBox(ctx, detection.boundingBox)
            //     }
            // }
        }
    });
    onDestroy(() => {
        running = false;
        cancelAnimationFrame(rafId);
        stream?.getTracks().forEach((t) => t.stop());

        showCamera(null);
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
