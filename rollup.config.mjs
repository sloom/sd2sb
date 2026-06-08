import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/plugin.ts",
  output: {
    file: "org.gakuya.sd2sb.sdPlugin/bin/plugin.js",
    format: "esm",
    sourcemap: true
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      sourceMap: true,
      declaration: false,
      noEmit: false,
      outDir: "org.gakuya.sd2sb.sdPlugin/bin"
    })
  ],
  external: ["node:crypto"]
};
