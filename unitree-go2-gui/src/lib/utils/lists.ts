import { clamp, identity, pipe, range, sortBy, splice } from 'remeda';

/// The indices `_a` and `_b` as the lowest and the highest.
export const span = (_a: number, _b: number) => sortBy([_a, _b], identity());

/// Every index from `_a` to `_b`, in either order.
export const covered = (_a: number, _b: number) => pipe(span(_a, _b), ([_lo, _hi]) => range(_lo, _hi + 1));

/// `_index` moved onto the first or the last index of `_items` when it falls outside them.
export const within = (_items: readonly unknown[], _index: number) => clamp(_index, { min: 0, max: _items.length - 1 });

/// `_items` with the item at `_from` moved to position `_to`.
export const move = (_from: number, _to: number) => <T>(_items: T[]) =>
    pipe(_items, splice<T>(_from, 1, []), splice(_to, 0, [_items[_from]]));
