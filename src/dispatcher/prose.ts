// A linked Dispatcher has no node_modules, so its bundle ships the kit's own file under this
// module's name, and `./prose` reaches the same matchers from src/ and from the bundle.
export { proseRefused, readerOf } from "@avi2dg/checks/scripts/prose-matchers.ts";
