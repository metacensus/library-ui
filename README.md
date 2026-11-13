# @metacensus/library-ui

MetaCensus's brand layer and a small set of UI tools, as one ESM React package (React 18 peer).

The first release's contents are tracked in this repository's issues. So far it ships the marks, the brand tokens and the components.

## Use

```shell
npm install @metacensus/library-ui
```

Marks are importable as `@metacensus/library-ui/marks/mark.svg` and its siblings.

## Components

```css
@import '@metacensus/library-ui/fonts.css';
@import '@metacensus/library-ui/tokens.css';
@import '@metacensus/library-ui/styles.css';
```

`styles.css` is plain CSS, every class `mc-` prefixed and none scoped to a site, reading the roles in `tokens.css`. No Tailwind is needed. Set `font-family: var(--mc-font-sans)` on your page.

`styles.css` declares `@layer mc`, so its rules sit in a cascade layer and lose to any unlayered rule of yours. `tokens.css` stays unlayered: custom properties do not compete with utilities. With Tailwind 4, put this line first so utilities beat the components, and `className="p-0"` or `"hidden"` on `Button`, `Header`, `Nav` or `ThemeToggle` wins without `!important`:

```css
@layer theme, base, mc, components, utilities;
```

Any unlayered rule of yours now beats the package's, whatever its specificity: a bare `button { ... }` beats `.mc-button`, which it did not before. That is how your own CSS wins. To choose the layer's name, import it as `@import '@metacensus/library-ui/styles.css' layer(brand);`, which nests the rules as `brand.mc`, and name `brand` in the ordering line in place of `mc`.

Components render on the server: no router, auth or API client, and no browser global while rendering. In Astro, add `@astrojs/react`; the marks and chrome render at build with no `client:` directive and ship no JS. Only `ThemeToggle` needs one, as `client:visible`.

- Marks: `MetaCensusMark`, `MetaCensusLockup`, `MetaCensusArrow`, `LogoArrowMorph`, and the shared geometry, including the lockup's spacing (`LOCKUP_VIEWBOX`, and `LOCKUP_MARK_BOX` for the mark's box within it).
- Chrome: `Header` (`nav` and `actions` slots, which wrap on a narrow screen; with no `nav`, the `actions` sit at the end of the row), `Footer` (`brand` replaces the linked lockup and its link is the consumer's; `tagline`; link columns as children), `Nav` (`links`).
- Tools: `cn`, `Button`, `Notice`, `Chip`, the form kit (`Field`, `Label`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `FieldError`), `useTheme`, `ThemeToggle`, `themeScript`.

- Marks take `variant`: `auto` (the default: solid on light, reversed on dark), `solid` or `reversed`, and `gradient` on the lockup, which needs a white or very light ground. Mark usage is in [TRADEMARKS.md](TRADEMARKS.md).
- `LogoArrowMorph` is a pure function of `progress`, 0 the mark and 1 the arrow; whatever places it owns the timing. Keep it horizontal.
- `Nav`'s mobile menu is a checkbox and CSS, so it works without JS.
- `Button` takes `variant`: `primary` (the default; one per view), `secondary`, `text`, `danger` or `inverse`. A solid Garnet fill marks only a risky action: one that destroys, discards, revokes or cannot be undone. A vote, a filter or a choice between options is not risky. `inverse` is a white fill for the call to action on a `--mc-fill-solid`, `--mc-gradient-hero` or `--mc-night` ground, where `primary` is the ground's own colour or nearly so. Use it on those grounds only: it reads the same in light and dark, and `secondary` inside `.dark` is its quieter sibling.
- `Notice` takes `tone`: `alert` (the default, which reads the `--mc-alert-*` roles), `info` (the blue tint) or `success` (the purple tint fill with the accent ink, since the palette has no green). It renders `role="note"`; pass `role="alert"` for an error.
- `Button` and `Notice` follow the guidelines' illustrated Actions and Callout patterns. Those patterns do not bind yet: the guidelines have yet to state their shape.
- Theme: inline `themeScript` in `<head>` so a stored override is on `<html>` before first paint. `useTheme` and `ThemeToggle` read and set it: `system` (the OS), `light` or `dark`.

```astro
---
import { Header, Nav, Button, themeScript } from '@metacensus/library-ui'
---
<head>
  <script is:inline set:html={themeScript} />
</head>
<Header>
  <Nav slot="nav" links={[{ href: '/research', label: 'Research' }]} />
  <Button slot="actions" href="/join">Join</Button>
</Header>
<Button variant="danger">Delete account</Button>
```

In `.astro` files, pass `Header`'s `nav` and `actions` as named slots; JSX props there fail the build.

## Brand tokens

```css
@import '@metacensus/library-ui/fonts.css';
@import '@metacensus/library-ui/tokens.css';
@import '@metacensus/library-ui/theme.css'; /* optional: Tailwind 4 */
```

```js
// tailwind.config.js, optional: Tailwind 3
presets: [require('@metacensus/library-ui/tailwind3')]
```

- `tokens.css` holds every `--mc-*` property below.
- `fonts.css` loads Inter 400, 500, 700 and 800 from [`@fontsource/inter`](https://fontsource.org/fonts/inter), under its own licence (SIL OFL 1.1). No type scale ships: the guidelines state none. Medium over bold.
- `theme.css` maps the roles, the font and the shape into a Tailwind 4 `@theme` (`bg-mc-card`, `text-mc-ink`). Consumers not on Tailwind 4 skip it.
- `tailwind3` is the same names as a Tailwind 3 preset (`tailwind3.cjs`, CommonJS as Tailwind 3 configs are): `bg-mc-card` is the same under either, and `bg-mc-card/50` becomes `color-mix(in srgb, var(--mc-card) 50%, transparent)`, so the roles keep their light and dark. Tailwind 3 never reads `theme.css`, and Tailwind 4 needs no preset. `theme(colors.mc.ink / 50%)` drops the opacity and emits bare `var(--mc-ink)`, and the legacy `bg-opacity-*` does nothing on a role.

Roles resolve light or dark by the OS setting. `.dark` or `.light` on any element overrides its subtree, which is also how a light panel stays light on a dark page. Components read roles, never the palette.

### Palette

Each family runs bold, mid, tint. Purple leads and grey follows; reds then blues accent. Golds are named for print and no role uses them.

| Family   | Bold      | Mid       | Tint      |
| -------- | --------- | --------- | --------- |
| `purple` | `#3B0E75` | `#915EDA` | `#D0B5E6` |
| `grey`   | `#444A5A` | `#8A90A2` | `#E8E8EC` |
| `red`    | `#91042A` | `#FF6F5E` | `#FFE5E2` |
| `blue`   | `#0A4A78` | `#3D9BD1` | `#DCEDF7` |
| `gold`   | `#C28E2F` | `#E0D3A8` | `#F9F7EF` |

A step is `--mc-<family>-<step>`, as `--mc-purple-bold`. `--mc-white` and `--mc-night` (`#121318`, the dark ground) complete it.

### Roles

| Role                 | Light       | Dark                        |
| -------------------- | ----------- | --------------------------- |
| `--mc-ground`        | white       | night                       |
| `--mc-card`          | white       | grey bold into the ground   |
| `--mc-surface`       | grey tint   | grey bold, deeper           |
| `--mc-hairline`      | grey tint   | grey bold, deepest          |
| `--mc-ink`           | grey bold   | grey tint                   |
| `--mc-ink-secondary` | grey mid    | grey mid                    |
| `--mc-line-input`    | grey mid    | grey mid                    |
| `--mc-series`        | blue bold   | blue mid                    |
| `--mc-ink-accent`    | purple bold | purple tint                 |
| `--mc-line-accent`   | purple mid  | purple mid                  |
| `--mc-fill-solid`    | purple bold | purple bold                 |
| `--mc-fill-emphasis` | purple tint | purple bold into the ground |
| `--mc-action`        | purple bold | purple bold                 |
| `--mc-action-risk`   | red bold    | red bold                    |
| `--mc-ink-on-fill`   | white       | white                       |
| `--mc-alert-fill`    | red tint    | red bold into the ground    |
| `--mc-alert-ink`     | red bold    | red mid                     |
| `--mc-alert-border`  | red bold    | red bold                    |
| `--mc-signal`        | red mid     | red mid                     |

`--mc-ink-on-fill` is the ink for text and icons on `--mc-fill-solid`, `--mc-action` and `--mc-action-risk`. It is not for `--mc-signal`, which does not carry white text, or `--mc-fill-emphasis`, whose ink is `--mc-ink`. `--mc-signal` is Coral: one use per surface, never in the logo, headings, chrome or an action. On dark, `--mc-alert-ink` and `--mc-tint-red-ink` resolve to Coral too, but are not the signal.

`--mc-line-input` is the boundary a control must have: the border of a control, at least 3:1 against `--mc-card` in light and dark. `--mc-hairline` is a divider that need not be seen.

`--mc-series` is the stroke or fill of a chart series, at least 3:1 against `--mc-card` in light and dark.

### Tint fills

The default for a chip, pill, badge or callout: the family's tint as the fill, its bold step as ink and border. On dark each family inverts: bold at 18% over the ground is the fill, mid is the ink and border.

`--mc-tint-<family>-fill` and `--mc-tint-<family>-ink` for `purple`, `grey`, `red` and `blue`. The border takes the ink. Gold has no pair; it is print only.

### Slate Mist

`--mc-grey-mid` is for text demoted in place: copy that stops being the subject and becomes context for what replaced it. Copy that is merely secondary starts in Charcoal, which is `--mc-ink`. On white Slate Mist is about 3.2:1, under the 4.5:1 minimum for small text, so `--mc-ink-secondary` is not for small text there. For an outline, use `--mc-line-input`.

### Gradients

- `--mc-gradient-hero`, `#3B0E75` to `#915EDA`, for hero fills.
- `--mc-gradient-lockup`, `#37128A` to `#AB82EC`, the lockup's own.

Two stops each; add no third and route neither through an accent family.

### Shape (provisional)

- `--mc-radius: 6px`
- `--mc-shadow`: a hard `5px 5px 0` offset in `--mc-ink` at 90%

Both are the public site's values. The guidelines state no shape yet; the pending shape decision settles them.

## Develop

```shell
make deps
make check
```

`make help` lists the targets. A tag `vX.Y.Z` on `main` publishes to npm; `make release TYPE=patch|minor|major` creates it.

## License

The code is [`AGPL-3.0-only`](LICENSE). The marks in [`marks/`](marks) are not: all rights reserved, with their permitted use in [TRADEMARKS.md](TRADEMARKS.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
