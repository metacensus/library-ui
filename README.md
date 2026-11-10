# @metacensus/library-ui

MetaCensus's brand layer and a small set of UI tools, as one ESM React package (React 18 peer).

The first release's contents are tracked in this repository's issues. Nothing ships yet beyond the marks.

## Use

```shell
npm install @metacensus/library-ui
```

Marks are importable as `@metacensus/library-ui/marks/mark.svg` and its siblings.

## Develop

```shell
make deps
make check
```

`make help` lists the targets. A tag `vX.Y.Z` on `main` publishes to npm; `make release TYPE=patch|minor|major` creates it.

## License

The code is [`AGPL-3.0-only`](LICENSE). The marks in [`marks/`](marks) are not: all rights reserved, with their permitted use in [TRADEMARKS.md](TRADEMARKS.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
