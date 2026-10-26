import { loadBodies } from "../../src/bodies/bodies";
import { loadSelection } from "../../src/bodies/selection";
import { valueOf } from "./effect";

export const repo = new URL("../../", import.meta.url).pathname;

export const bodies = await valueOf(loadBodies(repo));

export const selection = await valueOf(loadSelection(repo));
