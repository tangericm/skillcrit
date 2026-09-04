import assert from "node:assert/strict";
import { greet } from "./greet.mjs";

assert.equal(greet("Ada"), "hello Ada");
console.log("ok");
