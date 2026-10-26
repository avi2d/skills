import { Effect } from "effect";
import { platform, type Platform } from "../../src/platform/platform";

const onPlatform = <A, E>(effect: Effect.Effect<A, E, Platform>): Effect.Effect<A, E> => Effect.provide(effect, platform);

// `flip` swaps the channels, so running it yields the failure and raises on a success the test did not expect.
export const failure = <A, E>(effect: Effect.Effect<A, E, Platform>): E => Effect.runSync(Effect.flip(onPlatform(effect)));

export const failureOf = <A, E>(effect: Effect.Effect<A, E, Platform>): Promise<E> =>
  Effect.runPromise(Effect.flip(onPlatform(effect)));

export const value = <A, E>(effect: Effect.Effect<A, E, Platform>): A => Effect.runSync(onPlatform(effect));

export const valueOf = <A, E>(effect: Effect.Effect<A, E, Platform>): Promise<A> => Effect.runPromise(onPlatform(effect));

export const said = <A, E extends { readonly message: string }>(effect: Effect.Effect<A, E, Platform>): string =>
  failure(effect).message;

export const saidBy = async <A, E extends { readonly message: string }>(
  effect: Effect.Effect<A, E, Platform>,
): Promise<string> => (await failureOf(effect)).message;
