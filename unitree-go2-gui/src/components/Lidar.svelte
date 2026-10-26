<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';
    import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let points: THREE.Points;
    let canvas: HTMLCanvasElement;
    let geometry: THREE.BufferGeometry | null = null;
    let animationFrameId: number;

    // Container dimensions
    let width = $state(0);
    let height = $state(0);
    let maxPointCount = 0;
    let controls : OrbitControls;


    function distanceToColor(distance: number, maxDistance: number): THREE.Color {
        // Clamp distance to [0, maxDistance]
        const normalized = Math.min(Math.max(distance / maxDistance, 0), 1);
        // Hue ranges from 240 (blue) to 0 (red)
        const hue = (1 - normalized) * 240;
        return new THREE.Color(`hsl(${hue}, 100%, 50%)`);
    }

    function getPointColor(point: number[], gridSize: number, spacing: number): THREE.Color {
        // Center of grid in xy plane
        // const centerX = (gridSize * spacing) / 2;
        // const centerY = (gridSize * spacing) / 2;
          const centerX = 0;
        const centerY = 0;
        // Distance in xy plane only (z is ignored)
        const distance = Math.sqrt((point[0] - centerX) ** 2 + (point[1] - centerY) ** 2);
        // Max distance is from center to corner
        const maxDistance = (gridSize * spacing) / 2;
        return distanceToColor(distance, maxDistance);
    }

    function generatePointCloud(): number[][] {
        const points: number[][] = [];
        const gridSize = 100; // 35x35 = 1225 points
        const spacing = 5;
        const amplitude = 30;  // Increase mountain height
        const scale = 0.02;    // MUCH smaller - this is the key fix!
        
        const simplex = new SimplexNoise();
        
        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
               
                const px = (x - gridSize / 2) * spacing;
                const py = (y - gridSize / 2) * spacing;
                const pz = 50;  // Base height
                
                 let amplitude2 = (Math.sqrt(px * px + py * py) / (250))**2
                // Apply SimplexNoise displacement along z
                // With scale = 0.02, adjacent points sample nearby noise values
                const noise = simplex.noise3d(px * scale, py * scale, 0);
                const displacement = noise * amplitude;
                
                points.push([px, py, (pz + displacement)*(1+ amplitude2)]);
            }
        }
        
        return points;
    }

    function initScene() {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set( 0, 20, 100 );

        // Use the existing canvas
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
        });
        renderer.setSize(width, height);

        // Initialize OrbitControls after renderer and camera are set up
        controls = new OrbitControls(camera, canvas);
        controls.autoRotate = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // Generate and render point cloud
        const gridSize = 100;
        const spacing = 5;
        const pointCloud = generatePointCloud();
        const pointCount = pointCloud.length;
        
        // Create geometry
        geometry = new THREE.BufferGeometry();
        maxPointCount = Math.max(pointCount * 1.2, 50000); // Allocate with 20% buffer
        
        // Pre-allocate buffers for max capacity
        const positions = new Float32Array(maxPointCount * 3);
        const colors = new Float32Array(maxPointCount * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Update only the used range
        const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
        const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
        const positionsArray = positionAttr.array as Float32Array;
        const colorsArray = colorAttr.array as Float32Array;

        for (let i = 0; i < pointCount; i++) {
            const point = pointCloud[i];
            positionsArray[i * 3] = point[0];
            positionsArray[i * 3 + 1] = point[1];
            positionsArray[i * 3 + 2] = point[2];

            const color = getPointColor(point, gridSize, spacing);
            colorsArray[i * 3] = color.r;
            colorsArray[i * 3 + 1] = color.g;
            colorsArray[i * 3 + 2] = color.b;
        }

        positionAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;
        geometry.setDrawRange(0, pointCount);

        const material = new THREE.PointsMaterial({ 
            size: 0.50, 
            vertexColors: true,
            sizeAttenuation: true
        });
        points = new THREE.Points(geometry, material);
        scene.add(points);

        function animate() {
            animationFrameId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        return () => {
            cancelAnimationFrame(animationFrameId);
            geometry?.dispose();
            renderer.dispose();
            controls.dispose();
        };
    }

    onMount(initScene);

    // Fits the camera and the renderer to the canvas's size, at mount and on every resize. Declared
    // after `onMount`, so its first run finds the camera and the renderer that `initScene` creates.
    $effect(() => {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });
</script>

<!-- Your existing canvas -->
<div class="container">
    <canvas
        bind:this={canvas}
        width="1280"
        height="720"
        bind:clientWidth={width}
        bind:clientHeight={height}
    >
    </canvas>
</div>

<style>
    *{
        cursor: none;
    }
    .container {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: black;
        overflow: hidden;
    }
    canvas {
        aspect-ratio: 16/9;
        max-width: 100%;
        max-height: 100%;
        display: block;
        background-color: blue;
    }
</style>
