import { Redis } from "@upstash/redis";

// Lazy: `Redis.fromEnv()` validates the URL at construction time (must start
// with `https://`). Some callers import this singleton from modules that get
// evaluated during Next.js build/route analysis where the real env values are
// not present. Defer construction to first use so build-time placeholders no
// longer crash the build — only runtime calls hit the validator.
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (_redis === null) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    const instance = getRedis();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
