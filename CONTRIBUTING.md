# Contributing

Contributions are accepted under the [Developer Certificate of Origin 1.1](https://developercertificate.org). Sign off every commit:

```shell
git commit -s
```

A pull request needs the `DCO` check, which fails on a commit without a `Signed-off-by` line; `git rebase --signoff main` adds missing ones. You keep your copyright; your contribution carries this repository's license.

The marks in `marks/` are not contributed to or licensed for reuse; see [TRADEMARKS.md](TRADEMARKS.md).

Before a pull request:

```shell
make check
```
