<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable, get } from 'svelte/store';
	import { gamepadStore } from '../lib/gamepadStore';
	import * as R from 'ramda';
	// Types for gamepad input

	export let monitoring
	type InputEvent<T> = {
		index: number;
		value: T;
		timestamp: number;
	};


	type EventsArray<T> = InputEvent<T>[];

	type MapEntry<T> = {
		keyName: string;
		callback: (event: InputEvent<T>) => void;
	};


	// Function that updates an array by appending an item to the end and removing the first one if the resulting length exceeds 4
	function updateArray(newState: any) {
		type T = ReturnType<typeof newState>;
		return (array: T[]) =>
			array.length >= 4 ? R.drop(1, R.append(newState, array)) : R.append(newState, array);
	}

	//Factory function that generates callbacks tuned to update gamepadStore using a lens at a given path.
	let callbackFactory = (path: string[]) => (event: InputEvent<any>) => {
		type T = ReturnType<typeof event.value>;
		//stateLens is a lens over the state array of the given button
		let stateLens = R.lensPath(path);
		let stateArray: EventsArray<T> = R.view(stateLens, get(gamepadStore));
		if (R.last(stateArray)?.value !== event.value) {
			gamepadStore.update((state) => R.over(stateLens, updateArray(event), state));
		}
	};

	const BUTTON_MAP: Record<number, MapEntry<Boolean>> = {
		0: { keyName: 'A', callback: callbackFactory(['buttonsState', 'A']) },
		1: { keyName: 'B', callback: callbackFactory(['buttonsState', 'B']) },
		2: { keyName: 'X', callback: callbackFactory(['buttonsState', 'X']) },
		3: { keyName: 'Y', callback: callbackFactory(['buttonsState', 'Y']) },
		4: { keyName: 'LB', callback: callbackFactory(['buttonsState', 'LB']) },
		5: { keyName: 'RB', callback: callbackFactory(['buttonsState', 'RB']) },
		6: { keyName: 'LT', callback: callbackFactory(['buttonsState', 'LT']) },
		7: { keyName: 'RT', callback: callbackFactory(['buttonsState', 'RT']) },
		8: { keyName: 'MINUS', callback: callbackFactory(['buttonsState', 'MINUS']) },
		9: { keyName: 'PLUS', callback: callbackFactory(['buttonsState', 'PLUS']) },
		10: { keyName: 'LEFT_STICK', callback: callbackFactory(['buttonsState', 'LEFT_STICK']) },
		11: { keyName: 'RIGHT_STICK', callback: callbackFactory(['buttonsState', 'RIGHT_STICK']) },
		12: {keyName: 'UP', callback: callbackFactory(['buttonsState', 'UP']) },
		13: {keyName: 'DOWN', callback: callbackFactory(['buttonsState', 'DOWN']) },
		14: {keyName: 'LEFT', callback: callbackFactory(['buttonsState', 'LEFT']) },
		15: {keyName: 'RIGHT', callback: callbackFactory(['buttonsState', 'RIGHT']) },
		16: { keyName: 'HOME', callback: callbackFactory(['buttonsState', 'HOME']) },
	};

	const AXIS_MAP: Record<number, MapEntry<number>> = {
		0: { keyName: 'LEFT_STICK_X', callback: callbackFactory(['axisState', 'LEFT_STICK_X']) },
		1: { keyName: 'LEFT_STICK_Y', callback: callbackFactory(['axisState', 'LEFT_STICK_Y']) },
		2: { keyName: 'RIGHT_STICK_X', callback: callbackFactory(['axisState', 'RIGHT_STICK_X']) },
		3: { keyName: 'RIGHT_STICK_Y', callback: callbackFactory(['axisState', 'RIGHT_STICK_Y']) },
		4: { keyName: 'LEFT_TRIGGER', callback: callbackFactory(['axisState', 'LEFT_TRIGGER']) },
		5: { keyName: 'RIGHT_TRIGGER', callback: callbackFactory(['axisState', 'RIGHT_TRIGGER']) },
	};

	let animationFrameId: number;

	// Polls the gamepad and passes current state to callbacks
	function pollGamepad() {
		const gamepad = navigator.getGamepads?.()[0];
		if (gamepad) {
			const timestamp = performance.now();
			// Invoke button callbacks
			Object.keys(BUTTON_MAP).forEach((key: any) => {
				BUTTON_MAP[key].callback({
					index: key,
					value: gamepad.buttons[key].pressed,
					timestamp,
				});
			});
			// Invoke axis callbacks
			Object.keys(AXIS_MAP).forEach((key: any) => {
				AXIS_MAP[key].callback({ index: key, value: gamepad.axes[key], timestamp });
			});
		}
		animationFrameId = requestAnimationFrame(pollGamepad);
	}

	onMount(() => {
		// Start polling
		pollGamepad();
		// Listen for gamepad disconnection - scan for other available gamepads
		const handleGamepadDisconnected = () => {
			console.log('Gamepad disconnected, scanning for other gamepads...');
			// The next poll cycle will call findGamepad() which will find any remaining connected gamepad
		};
		window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

		return () => {
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
<div style="position: fixed; color: blue">
	{#if monitoring==true}
	<ul>
		{#each Object.entries($gamepadStore.buttonsState) as [key, value]}
			<li>{key}: {JSON.stringify(value)}</li>
		{/each}
	</ul>
	<ul>
		{#each Object.entries($gamepadStore.axisState) as [key, value]}
			<li>{key}: {JSON.stringify(value)}</li>
		{/each}
	</ul>
		
	{/if}
	
</div>

<style>
	/* Empty - this is a logic-only component */
</style>
