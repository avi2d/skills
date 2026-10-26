// A linked Dispatcher has no node_modules, so its bundle ships the kit's own file under this
// module's name, and `./comments` reaches the same matchers from src/ and from the bundle.
export { SYNTAXES, commentsIn, refused, syntaxOf } from "@avi2dg/checks/scripts/comment-matchers.ts";
