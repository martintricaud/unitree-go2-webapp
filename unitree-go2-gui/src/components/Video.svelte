<script lang="ts">
    // The whole face landmarking detection logic is adapted from https://codepen.io/mediapipe-preview/pen/OJBVQJm
    import {
        FaceLandmarker,
        FilesetResolver,
        DrawingUtils,
        FaceDetector,
    } from '@mediapipe/tasks-vision';
    import { onMount } from 'svelte';
    import { videoFrame } from '../lib/webSocketClient';
    import type { NormalizedLandmark, Detection } from '@mediapipe/tasks-vision';

    export let faceLandmarksEnabled: boolean = true;
    export let faceDetectionEnabled: boolean = true;
    let canvas: HTMLCanvasElement;
    let liveView: HTMLElement;
    let ctx: CanvasRenderingContext2D;
    let faceLandmarker: FaceLandmarker | null = null;
    let faceDetector: FaceDetector | null = null;
    let drawingUtils: DrawingUtils;
    let lastTs = 0;

    // Keep a reference of all the child elements we create (for FaceDetection)so we can remove them easilly on each render.
    let children:HTMLElement[] = [];
    function initFaceDetection() {
        FilesetResolver.forVisionTasks('wasm')
            .then((resolver) =>
                FaceDetector.createFromOptions(resolver, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                }),
            )
            .then((lm) => {
                faceDetector = lm;
            });
    }

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

    function displayVideoDetections(detections: Detection[], ) {
        // Remove any highlighting from previous frame.

        for (let child of children) {
            liveView.removeChild(child);
        }
        children.splice(0);

        // Iterate through predictions and draw them to the live view
        for (let detection of detections) {
            const p = document.createElement('p');
            let boundingBox = detection.boundingBox??{width:0, height:0, originX:0, originY:0}
            p.innerText =
                'Confidence: ' +
                Math.round(detection.categories[0].score * 100) +
                '% .';
            p.style =
                'left: ' +
                (canvas.offsetWidth - boundingBox.width - boundingBox.originX) +
                'px;' +
                'top: ' +
                (boundingBox.originY - 30) +
                'px; ' +
                'width: ' +
                (boundingBox.width - 10) +
                'px;';

            const highlighter = document.createElement('div');
            highlighter.setAttribute('class', 'highlighter');
            highlighter.style =
                'left: ' +
                (canvas.offsetWidth - boundingBox.width - boundingBox.originX) +
                'px;' +
                'top: ' +
                boundingBox.originY +
                'px;' +
                'width: ' +
                (boundingBox.width - 10) +
                'px;' +
                'height: ' +
                boundingBox.height +
                'px;';

            liveView.appendChild(highlighter);
            liveView.appendChild(p);

            // Store drawn objects in memory so they are queued to delete at next call
            children.push(highlighter);
            children.push(p);
            for (let keypoint of detection.keypoints) {
                const keypointEl = document.createElement('spam');
                keypointEl.className = 'key-point';
                keypointEl.style.top = `${keypoint.y * canvas.offsetHeight - 3}px`;
                keypointEl.style.left = `${
                    canvas.offsetWidth - keypoint.x * canvas.offsetWidth - 3
                }px`;
                liveView.appendChild(keypointEl);
                children.push(keypointEl);
            }
        }
    }

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
                let result = faceLandmarker.detectForVideo(canvas, now);
                if (!result.faceLandmarks) return;
                drawFaceLandmarks(result.faceLandmarks);
            }
            if (faceDetector && faceDetectionEnabled) {
                let result = faceDetector.detectForVideo(canvas, now);
                if (!result.detections) return;
                displayVideoDetections(result.detections);
            }
        });

        return () => unsubscribe();
    });
</script>

<div bind:this={liveView} class="container">
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
