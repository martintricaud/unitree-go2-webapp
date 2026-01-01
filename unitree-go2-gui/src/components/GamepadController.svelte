<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Types for gamepad input
	interface ButtonEvent {
		buttonIndex: number;
		pressed: boolean;
		timestamp: number;
	}

	interface AxisEvent {
		axisIndex: number;
		value: number;
		timestamp: number;
	}

	type ButtonEntry = {
		keyName: string;
		callback: (event: ButtonEvent, gamepadIndex: number) => any;
	};

	type AxisEntry = {
		keyName: string;
		callback: (event: AxisEvent, gamepadIndex: number) => any;
	};

	const BUTTON_MAP: Record<number, ButtonEntry> = {
		0: { keyName: 'A', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('A:', event) },
		1: { keyName: 'B', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('B:', event) },
		2: { keyName: 'X', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('X:', event) },
		3: { keyName: 'Y', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('Y:', event) },
		4: { keyName: 'LB', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('LB:', event) },
		5: { keyName: 'RB', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('RB:', event) },
		6: { keyName: 'LT', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('LT:', event) },
		7: { keyName: 'RT', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('RT:', event) },
		8: { keyName: 'BACK', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('BACK:', event) },
		9: { keyName: 'START', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('START:', event) },
		10: { keyName: 'LEFT_STICK', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('LEFT_STICK:', event) },
		11: { keyName: 'RIGHT_STICK', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('RIGHT_STICK:', event) },
		16: { keyName: 'XBOX', callback: (event: ButtonEvent, gamepadIndex: number) => console.log('XBOX:', event) }
	};

	const AXIS_MAP: Record<number, AxisEntry> = {
		0: { keyName: 'LEFT_STICK_X', callback: (event: AxisEvent, gamepadIndex: number) => console.log('LEFT_STICK_X:', event) },
		1: { keyName: 'LEFT_STICK_Y', callback: (event: AxisEvent, gamepadIndex: number) => console.log('LEFT_STICK_Y:', event) },
		2: { keyName: 'RIGHT_STICK_X', callback: (event: AxisEvent, gamepadIndex: number) => console.log('RIGHT_STICK_X:', event) },
		3: { keyName: 'RIGHT_STICK_Y', callback: (event: AxisEvent, gamepadIndex: number) => console.log('RIGHT_STICK_Y:', event) },
		4: { keyName: 'LEFT_TRIGGER', callback: (event: AxisEvent, gamepadIndex: number) => console.log('LEFT_TRIGGER:', event) },
		5: { keyName: 'RIGHT_TRIGGER', callback: (event: AxisEvent, gamepadIndex: number) => console.log('RIGHT_TRIGGER:', event) }
	};

	let connectedGamepadIndex: number | null = null;
	let animationFrameId: number;

	/**
	 * Polls the gamepad and passes current state to callbacks
	 */
	function pollGamepad() {
		const gamepads = navigator.getGamepads?.();
		if (!gamepads) {
			animationFrameId = requestAnimationFrame(pollGamepad);
			return;
		}

		// Find the first connected gamepad
		let gamepad: Gamepad | null = null;
		for (let i = 0; i < gamepads.length; i++) {
			if (gamepads[i]) {
				gamepad = gamepads[i];
				connectedGamepadIndex = i;
				break;
			}
		}

		if (gamepad) {
			const timestamp = performance.now();

			// Invoke button callbacks
			Object.keys(BUTTON_MAP).forEach((key: any) => {
				const button = gamepad!.buttons[key];
				BUTTON_MAP[key].callback(
					{ buttonIndex: key, pressed: button.pressed, timestamp },
					connectedGamepadIndex ?? 0
				);
			});

			// Invoke axis callbacks
			Object.keys(AXIS_MAP).forEach((key: any) => {
				const axisValue = gamepad!.axes[key];
				AXIS_MAP[key].callback(
					{ axisIndex: key, value: axisValue, timestamp },
					connectedGamepadIndex ?? 0
				);
			});
		}

		animationFrameId = requestAnimationFrame(pollGamepad);
	}

	onMount(() => {
		// Start polling
		pollGamepad();

		// Listen for gamepad connection events
		const handleGamepadConnected = (event: GamepadEvent) => {
			console.log('Gamepad connected:', event.gamepad.id);
			connectedGamepadIndex = event.gamepad.index;
		};

		const handleGamepadDisconnected = (event: GamepadEvent) => {
			console.log('Gamepad disconnected:', event.gamepad.id);
			if (connectedGamepadIndex === event.gamepad.index) {
				connectedGamepadIndex = null;
			}
		};

		window.addEventListener('gamepadconnected', handleGamepadConnected);
		window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

		return () => {
			window.removeEventListener('gamepadconnected', handleGamepadConnected);
			window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
		};
	});

	onDestroy(() => {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
	});
</script>

<!-- Component has no visual output, it's purely for handling input -->
<div style="display: none;">
	{#if connectedGamepadIndex !== null}
		<span>Gamepad {connectedGamepadIndex} connected</span>
	{:else}
		<span>No gamepad connected</span>
	{/if}
</div>

<style>
	/* Empty - this is a logic-only component */
</style>
