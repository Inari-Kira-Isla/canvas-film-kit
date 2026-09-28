# create-canvas-film

Scaffold a new [`canvas-film-kit`](https://www.npmjs.com/package/canvas-film-kit) project — a thin
CLI wrapper around that package's own scaffold implementation, so `npx create-canvas-film my-film
--profile abstract` and `kit new my-film --profile abstract` are exactly the same code path.

```bash
npx create-canvas-film my-film --profile abstract
cd my-film
npm install
npm run dev
```

See the repo root README for the full picture (profiles, gates, `approved_by` workflow):

- https://github.com/canvas-film-kit/canvas-film-kit#readme

## License

MIT — see [LICENSE](./LICENSE).
