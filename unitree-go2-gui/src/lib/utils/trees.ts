import { filter, flatMap, map, merge, pipe, prop, take, unique } from 'remeda';

/// A tree whose nodes all carry the fields `A`. A leaf also carries the fields `L`; an inner node
/// carries one or more subtrees under `items`. `L` must not have an `items` field.
export type Tree<A, L> = (A & L & { items?: never }) | (A & { items: [Tree<A, L>, ...Tree<A, L>[]] });

/// Any tree whose subtrees, if any, are under `items`. The functions below take this bound rather
/// than `Tree<A, L>`, so that TypeScript infers the node type from the argument.
type Branching<T> = { items?: readonly [T, ...T[]] };

/// Every node of `_trees` and of their subtrees, in pre-order.
export const preorder = <T extends Branching<T>>(_trees: readonly T[]): T[] =>
    flatMap(_trees, (_tree) => [_tree, ...preorder(_tree.items ?? [])]);

/// The leaves of `_trees`, in order.
export const leaves = <T extends Branching<T>>(_trees: readonly T[]) =>
    filter(preorder(_trees), (_tree): _tree is Exclude<T, { items: unknown }> => _tree.items === undefined);

/// The subtrees of an inner node, or the leaf itself: `_tree` with its root removed.
export const opened = <T extends Branching<T>>(_tree: T) => _tree.items ?? [_tree];

/// Numbers `_tree`, the tree at `_index` among `_trees`, and its subtrees in pre-order, so that the
/// first tree of `_trees` gets `_first`.
const numberedFrom =
    (_first: number) =>
    <A, L>(_tree: Tree<A, L>, _index: number, _trees: readonly Tree<A, L>[]): Tree<A & { id: number }, L> =>
        pipe(_first + preorder(take(_trees, _index)).length, (_id) =>
            _tree.items === undefined
                ? merge({ id: _id }, _tree)
                : merge(merge({ id: _id }, _tree), { items: map(_tree.items, numberedFrom(_id + 1)) }),
        );

/// `_trees` with every node numbered in pre-order from `_first` under `id`. `id` is each node's first
/// key, so that a numbered tree serializes to the same JSON text as one read back from it.
export const numbered = <A, L>(_trees: Tree<A, L>[], _first: number) => map(_trees, numberedFrom(_first));

/// The identifiers of every node of `_trees`, in pre-order.
const ids = <T extends Branching<T> & { id: number }>(_trees: readonly T[]) => map(preorder(_trees), prop('id'));

/// Whether no two nodes of `_trees` share an identifier.
export const distinct = <T extends Branching<T> & { id: number }>(_trees: readonly T[]) =>
    pipe(ids(_trees), (_ids) => unique(_ids).length === _ids.length);

/// An identifier no node of `_trees` holds: one above the highest.
export const nextId = <T extends Branching<T> & { id: number }>(_trees: readonly T[]) => Math.max(-1, ...ids(_trees)) + 1;
