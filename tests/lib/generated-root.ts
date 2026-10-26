import { readGeneratedRoot } from "../../src/generate/bundle";
import { hubUnder } from "../../src/generate/hub";
import { MACHINE, linksUnder } from "../../src/generate/link";
import { value } from "./effect";

export const GENERATED_ROOT = value(readGeneratedRoot);

export const HUB = hubUnder(GENERATED_ROOT);

export const LINKS = linksUnder(GENERATED_ROOT, MACHINE);
