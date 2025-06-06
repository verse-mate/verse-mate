"use client";

import { type Store, type StoreValue, listenKeys } from "nanostores";
import { useCallback, useSyncExternalStore } from "react";

type StoreKeys<T> = T extends { setKey: (k: infer K, v: any) => unknown }
  ? K
  : never;

export interface UseStoreOptions<SomeStore> {
  /**
   * Will re-render components only on specific key changes.
   */
  keys?: StoreKeys<SomeStore>[];
}

/**
 * Subscribe to store changes and get store’s value.
 *
 * Can be user with store builder too.
 *
 * ```js
 * import { useStore } from 'nanostores/react'
 *
 * import { router } from '../store/router'
 *
 * export const Layout = () => {
 *   let page = useStore(router)
 *   if (page.route === 'home') {
 *     return <HomePage />
 *   } else {
 *     return <Error404 />
 *   }
 * }
 * ```
 *
 * @param store Store instance.
 * @returns Store value.
 */
export function useStore<SomeStore extends Store>(
  store: SomeStore,
  options?: UseStoreOptions<SomeStore>,
): StoreValue<SomeStore> {
  const subscribe = useCallback(
    (onChange: (value: StoreValue<SomeStore>) => void) =>
      options?.keys && "setKey" in store
        ? listenKeys(store, options.keys, onChange)
        : store.listen(onChange),
    [options?.keys, store],
  );

  const get = store.get.bind(store);

  return useSyncExternalStore(subscribe, get, get);
}
