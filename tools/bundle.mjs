// Bundles an entry file into one self-contained script Affinity can run.
// Affinity's own modules ('/document.js', 'affinity:*') stay as runtime requires.
//   node tools/bundle.mjs <entry> <outfile> [bannerFile]
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';

const [entry, outfile, bannerFile] = process.argv.slice(2);
const affinityModules = {
    name: 'affinity-modules',
    setup(build) {
        build.onResolve({ filter: /^(\/|affinity:)/ }, args => ({ path: args.path, external: true }));
    }
};
await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'neutral',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    plugins: [affinityModules],
    mainFields: ['main'],
    banner: bannerFile ? { js: readFileSync(bannerFile, 'utf8') } : undefined,
    logLevel: 'warning'
});
