import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { derived } from 'svelte/store';
import * as R from 'ramda';
/**
 * GamepadState store
 * 
 * 1. Implement dead zone filtering logic:
 * 2. Support combination detection:
 * 3. Future: Integrate with stream library:
 */

type NonEmptyArray<T> = [T, ...T[]]

type InputEvent<T> = {
	index: number;
	value: T;
	timestamp: number;
};

type GamepadState = {
	buttonsState: Record<string, NonEmptyArray<InputEvent<boolean>>>;
	axisState: Record<string, NonEmptyArray<InputEvent<number>>>;
};

const initialState: GamepadState = {
	buttonsState: {
		A: [{timestamp:0,index:0,value:false}],
		B: [{timestamp:0,index:1,value:false}],
		X: [{timestamp:0,index:2,value:false}],
		Y: [{timestamp:0,index:3,value:false}],
		LB: [{timestamp:0,index:4,value:false}],
		RB: [{timestamp:0,index:5,value:false}],
		LT: [{timestamp:0,index:6,value:false}],
		RT: [{timestamp:0,index:7,value:false}],
		MINUS: [{timestamp:0,index:8,value:false}],
		PLUS: [{timestamp:0,index:9,value:false}],
		LEFT_STICK: [{timestamp:0,index:10,value:false}],
		RIGHT_STICK: [{timestamp:0,index:11,value:false}],
        UP: [{timestamp:0,index:12,value:false}],
        DOWN: [{timestamp:0,index:13,value:false}],
        LEFT: [{timestamp:0,index:14,value:false}],
        RIGHT: [{timestamp:0,index:15,value:false}],
		HOME: [{timestamp:0,index:16,value:false}],
	},
	axisState: {
		LEFT_STICK_X: [{timestamp:0,index:0,value:0}],
		LEFT_STICK_Y: [{timestamp:0,index:1,value:0}],
		RIGHT_STICK_X: [{timestamp:0,index:2,value:0}],
		RIGHT_STICK_Y: [{timestamp:0,index:3,value:0}],
		LEFT_TRIGGER: [{timestamp:0,index:4,value:0}],
		RIGHT_TRIGGER: [{timestamp:0,index:5,value:0}]
	}
};

export const gamepadStore = writable<GamepadState>(initialState);

const byTimeStampDesc = R.descend((e:InputEvent<any>) => e.timestamp);
let sortModifiers = (gamepadStoreInstance:GamepadState) => {
    //returns an array containing buttonKeys whose last event value is true, sorted by timestamp descending, using Ramda
    return R.filter(
        buttonState => R.last(buttonState).value === true, 
        gamepadStoreInstance.buttonsState
    );
}
let derive_modified_key = (modifierArray:InputEvent<boolean>[], keyArray:InputEvent<boolean>[]) => R.zipWith((modifier:InputEvent<boolean>, key:InputEvent<boolean>) => {
    return {
        index: modifier.index+"_"+key.index,
        value: modifier.value && key.value && (modifier.timestamp >= key.timestamp),
        timestamp: Math.max(modifier.timestamp, key.timestamp)
    }
}, modifierArray, keyArray);
    

let gamepadComboStore = derived(gamepadStore, ($gamepadStore:GamepadState) => {
    return {
        ZL_UP: derive_modified_key($gamepadStore.buttonsState.ZL, $gamepadStore.buttonsState.UP),
        ZL_DOWN: derive_modified_key($gamepadStore.buttonsState.ZL, $gamepadStore.buttonsState.DOWN),
        ZL_RIGHT: derive_modified_key($gamepadStore.buttonsState.ZL, $gamepadStore.buttonsState.RIGHT),
        ZL_LEFT: derive_modified_key($gamepadStore.buttonsState.ZL, $gamepadStore.buttonsState.LEFT),
        ZR_UP: derive_modified_key($gamepadStore.buttonsState.ZR, $gamepadStore.buttonsState.UP),
        ZR_DOWN: derive_modified_key($gamepadStore.buttonsState.ZR, $gamepadStore.buttonsState.DOWN),
    }
});