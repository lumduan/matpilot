/**
 * Stand-in for Node.js built-ins (fs, path, crypto) in the browser bundle.
 *
 * The Emscripten loader inside @pybricks/mpy-cross-v6 requires them only on its Node.js code path
 * (`if (ENVIRONMENT_IS_NODE)`), which never runs in a browser. Bundlers still have to resolve the
 * names, so next.config.ts aliases them to this empty module for browser builds only.
 */
const emptyNodeModule = {};
export default emptyNodeModule;
