# Coding Plan Global Price Comparison

[简体中文](README.md) | **English**

A site that compares the prices, token quotas and public benchmarks of AI Coding Plans (coding subscriptions) sold in China and internationally. The site itself is in Chinese.

- Main site: [coding-plan-comparison-tau.vercel.app](https://coding-plan-comparison-tau.vercel.app/). Mirror: [GitHub Pages](https://yufeng97.github.io/coding-plan-comparison/) (same content; switch to it if the main site is slow).
- Corrections and additions: [project issues](https://github.com/yufeng97/coding-plan-comparison/issues). The site pre-fills the title and evidence template for each type of contribution.

The fixed navigation covers three tasks: 「选套餐」 (choose a plan), 「模型评测」 (model benchmarks) and 「我的关注」 (watchlist). In the plan view, the 「章节」 (sections) menu in the header jumps to any section. Source notes and the correction form are in the footer.

Every price shows its official-site check date and source. For international plans, the site states mainland China availability only when the vendor has said so officially, for example when mainland China is outside the supported regions. Plans without an official statement are marked 「未核实」 (unverified).

## Documentation

These documents are in Chinese.

| Document | Contents |
|---|---|
| [Architecture and release](docs/architecture.md) | Page structure, file responsibilities, development conventions, build and deployment |
| [Data maintenance guide](docs/maintenance.md) | Daily automatic updates, per-record price checks, news monitoring, onboarding new vendors, model benchmarks, mainland China availability and change feeds |
| [Contributing guide](CONTRIBUTING.md) | Input format for incremental price checks, fields for new plans and the submission process |
| [Changelog](CHANGES.md) | Batches of data verification and code fixes |

## Data coverage

「帮我选」 (Help me choose) shows the tool, task and priority options up front; the priority can be quota, model capability or price. The payment method is summarized under the current settings and can be expanded and changed.

Below the recommendation cards, the top three tiers are listed side by side with:

- monthly price;
- main model;
- lower bound of the reference quota;
- DeepSWE v1.1 rank.

The recommendation rules are under 「推荐规则与口径」 (rules and definitions). Each card shows the first payment, a short renewal note, the reasons and the actions at the top. The 12-month cost scenarios, benchmarks and tier table are in the expandable details. The exact GLM, GPT Sol, Luna and Astra versions follow each tier's own model list. For Cursor, the card states the total cost of the metered pool for complex models separately.

「我的关注」 (Watchlist) shows watched plans and their changes first. Verification statistics and public JSON downloads are in the details further down.

- **Official model subscriptions**: Anthropic Claude, OpenAI Codex (ChatGPT), Google Gemini/Antigravity, xAI The X Subscription (Grok + Cursor + X; since 2026-10-12 it replaces SuperGrok and new Cursor purchases), Meta Muse Code, Mistral, the GLM Coding Plan (V1/V2/V3) from Zhipu BigModel and Z.ai, Moonshot Kimi, MiniMax, Xiaomi MiMo, StepFun Step Plan and more
- **Third-party tools and relays**: GitHub Copilot, Cursor (former individual and team tiers are now renewal-only), Windsurf/Devin, Zed, Cline, Roo Code, Kilo Code, Amp, JetBrains AI, Augment, OpenRouter, Lovable, Bolt.new, Replit, AWS Kiro, Factory Droid, Canopy Wave, OpenCode, Command Code, Freebuff, Kimchi, HumanLayer, Tencent CodeBuddy, ByteDance Trae, Baidu Comate, ZenMux (an API aggregation platform), plus API relays such as R4 Coder, PackyCode, AICodeMirror, 88code, DuckCoding, AIGoCode, DevPass and Chutes
- **Cloud and enterprise tiers**: AWS Q Developer, Google Gemini Code Assist, Alibaba Cloud Tongyi Lingma (Qoder CN), Tencent Cloud, Huawei Cloud CodeArts, iFlytek Astron Coding Plan and more
- **Pay-as-you-go API**: input and output prices of mainstream coding models, in the original USD or CNY and converted for comparison

<!-- readme-stats:coverage -->
Data version: **2026-10-26**. The catalog covers 61 vendors and 232 subscription plans, including 31 free tiers (after removing discontinued tiers and duplicate listings of the same subscription, 21 are usable free coding tools or free model entry points), 84 rows of in-depth plan quota comparison (official figures plus estimates labeled with a confidence level), 40 API price rows (39 models) and 10 pay-as-you-go API reference rows. Free entry points can be filtered by domestic or international availability and by whether free inference is included; BYOK and metered inference costs are called out separately. The update date on the page and in exports is the version date of the whole dataset; every price also records its own official-site check date and result.
<!-- /readme-stats:coverage -->

<!-- readme-stats:benchmarks -->
Public model benchmarks are versioned separately from prices: **checked 2026-10-13**, 5 benchmark families, 87 distinct protocols and 472 scores (DeepSWE v1.1 70, v1 29; CursorBench 4.0 68, 3.0 (historical launch excerpt) 3; OSWorld 224; HLE 48; SWE-bench 30). Each configuration of the same model, and OSWorld's full-completion and partial scores, count as separate entries, so this does not mean 472 models; results that differ in version, sample denominator, tools or step budget are never ranked together. Historical excerpts cover only the models in the official tables and are not complete historical leaderboards.
<!-- /readme-stats:benchmarks -->

## Daily automatic updates

GitHub Actions updates and publishes the data on a schedule (times are Beijing time):

- **08:17, news candidates** ([news-collect.yml](.github/workflows/news-collect.yml)):
  - No Claude credentials are required. It collects the past 14 days of news and preserves the queue, page baselines and source health; the window can also be set for a manual run.
  - Reports are available as run artifacts. Collection does not edit published data or deploy the site; a maintainer verifies, submits, reviews and merges changes.
- **08:30, exchange rates and benchmarks** ([daily-data.yml](.github/workflows/daily-data.yml)):
  - When the European Central Bank reference rate changes, the full CI (Linux and Windows, three browsers) runs on a candidate branch first. Once it passes, the update is merged into `main` and published automatically.
  - Public benchmarks are collected from fixed official leaderboards. When scores are added, changed or withdrawn, a PR is opened for the maintainer to check and merge.
- **09:00, prices and news** ([daily-inspection.yml](.github/workflows/daily-inspection.yml); optional, needs Claude credentials):
  - Claude Code collects news and opens the official pages to verify prices, plans and model releases one by one. It edits only data files, then opens a PR.
  - Web pages may contain prompt injection, so the maintainer must check the official links before merging.
- **Publishing**: commits on `main` that pass the full CI are published to GitHub Pages automatically. Once Vercel credentials are configured, the main site is published at the same time.

Prices must be checked against the official wording, so they never go live without review. Setup steps, required secrets and repository settings are in the [data maintenance guide](docs/maintenance.md#每日自动更新).

## Usage

Visit the [main site](https://coding-plan-comparison-tau.vercel.app/). To run it locally, see [Local development](#local-development) below. The page is built with Vite, so double-clicking `index.html` to open it over `file://` no longer works.

### Sharing and returning

The URL is updated as you go with:

- filter and sort state:
  - budget, region, tool, task, payment method and priority in 「帮我选」;
  - whether the table shows relays and unverified prices;
  - whether each section applies the purchase conditions;
  - table search and quota-table filters;
  - whether the personal price chart shows everything;
- the plans selected for comparison;
- the workload calculator inputs.

「复制方案链接」 (copy plan link) shares the same result. 「复制推荐摘要」 (copy recommendation summary) gives plain text you can paste into a chat. Refreshing keeps the state.

「保存常用条件」 (save conditions) stores one set of conditions on this device, which you can restore or delete. If the browser restricts storage, the page tells you.

Country-restricted plans are left out of general recommendations, and the full table labels them with their eligible countries. The `country` parameter in old links is removed automatically.

### Payment and filters

「帮我选」 can use the listed monthly price, auto-renewal or annual billing. It matches the monthly budget against the average monthly cost of the chosen method and shows three figures: the first payment, renewal at the current price and the cost of 12 months of use.

- **Listed monthly price** follows the catalog. Any discount conditions still need to be checked in the notes.
- **Auto-renewal** uses `autoRenewMonthly` where there is evidence. A regular monthly subscription with no separate renewal price uses the list price as the budget ceiling, marked as an estimate.
- **Annual billing** uses the full-year amount in the structured field `annualTotal` where available, and validation requires its monthly equivalent to match `priceY`. When only the monthly equivalent is known, the total is marked as an estimate, with a reminder that the whole year is paid up front.

The personal price chart, the full-quota cost ranking, the quota table and the price table can each apply or drop the purchase conditions. These conditions stack with each section's own search and category filters. Task preference affects only the recommendation order.

Once the conditions are applied:

- the price chart and plan quota costs use the chosen payment method;
- the price table keeps the catalog columns and adds a sort by the chosen method's monthly average;
- exports keep the same definitions.

Cancelling or clearing the conditions restores each section's own filters. The annual chart shows only plans with a published annual price.

Search accepts several keywords separated by spaces and keeps only records that match all of them. It also understands common Chinese and English product aliases. Search terms and share parameters are limited to 200 characters.

### Comparison and full benefits

From the recommendation cards and the table, you can add 2–4 tiers to a **side-by-side comparison**. If you select only one, the page asks you to pick another. After you remove tiers one by one or clear them, keyboard focus returns to an available control.

The comparison window can copy Markdown and export CSV, keeping your selection order. Filtered tables can export CSV or copy Markdown too. Both exports keep:

- billing units;
- the data update date;
- exchange rates;
- price-check sources;
- the full inherited benefits.

「完整权益」 (full benefits) opens the untruncated plan details. The window can be closed with the keyboard, returns focus to where you were, and still works where native dialogs are unavailable. Fields that differ are highlighted, as is the lowest price among tiers with the same billing unit. When a filter returns nothing, export is disabled and the page offers a way back.

### Workload-based estimates

There are two ways to bring in real usage:

- import it from ccusage (`npx ccusage@latest daily --json`);
- select Claude Code or Codex `.jsonl` session logs directly. You can pick several files or a whole log folder. Entries are deduplicated by message or by cumulative session snapshot. Logs are parsed only in the page, and large inputs are parsed in a background worker.

From either source, the page works out the input share, the cache hit rate and the days of use per month. If you leave the cache price empty, cache hits are billed at the official cache-hit price, excluding cache writes and storage. Models without an official cache price use the normal input price.

Below the results are three comparisons:

- the plan quota comparison;
- the pay-as-you-go cost of the same model;
- the subscription break-even point.

Monthly credit pools are converted at the current input/cache ratio and official API prices. Other plans are filtered by the lower bound of the page's reference quota. Each result states its basis.

「按我的用量核对」 (check against my usage), next to the recommendations, carries over your budget and any exactly matching model, then opens the calculator in the API section.

You can start from the light, everyday or heavy-use preset, then adjust:

- requests per day;
- total input-plus-output tokens per request;
- days of use;
- input share;
- input cache hit rate;
- monthly budget in CNY.

The conservative, typical and optimistic scenarios each use different input and cache assumptions. Each shows the expected monthly cost and the range if your workload is 20% higher or lower. Presets and scenarios are only examples; once you edit a value by hand, their highlight clears.

The cache price field is optional and labeled with its original currency. Models, currencies and price-check sources all come from the same price data.

Reference monthly volumes state whether the model matches and which conversion assumptions apply. Token counts from other models or under other assumptions are never used to promise that a quota is enough. The ranking and quota table also show a full-quota cost range from the upper and lower bounds of the reference quota; the headline value is still sorted by the midpoint.

All calculations happen in the page. Saved conditions use local storage, and your input is never uploaded.

### Loading and reading

The published page uses Vue server-side rendering for the default recommendations, price table and free entry points, so you can read them before any script runs. The browser then mounts the same Vue components and takes over based on the current link and the state saved on your device. Vite bundles the TypeScript entry into content-hashed modules.

On phones, the long introduction is collapsed by default, so budget, region, tool, task and priority come first; the payment method can be expanded. Recommendation cards, the usage check, and the share and save actions follow the same reading and keyboard order.

Price data, recommendations, tables and text details appear first. ECharts loads when you scroll near a chart or jump to a chart section. A chart that fails to load can be retried on its own, and if the main script fails, the page shows a reload option.

## Local development

Requires Node.js 22.12+. Run `npm ci` the first time, then:

```bash
npm run dev          # Vite dev server (listens on 127.0.0.1 only; changes apply immediately)
npm run serve        # build the release output and preview it with the bundled static server (127.0.0.1 only; serves only .site-build/)
npm run check        # syntax of the audit inputs and generated data scripts
npm run catalog:build # regenerate src/generated/catalog.ts after editing audit data
npm run catalog:check # only check that the generated catalog matches the audit inputs; writes nothing
npm run readme:build # regenerate the statistics in the Chinese and English READMEs after data changes (readme:check only checks)
npm run typecheck    # catalog consistency; strict checks of all TS modules, Vue templates and tests, and of the data and tool scripts
npm run check:architecture # check frontend module cycles and layer boundaries
npm run validate     # data structure, references, sources and dates
npm test             # Node tool and architecture checks in tests/scripts/, plus the TypeScript / Vue regressions
npm run test:unit    # formulas, data, full-page Vue and component tests (Vitest)
npm run test:browser # build, then run the end-to-end regressions in tests/e2e/ on Chromium / Firefox / WebKit
npm run build:site   # Vite + Vue SSR build of the release output in .site-build/
npm run size:check   # brotli size budgets of the release output (first-screen HTML, main entry, styles, ECharts)
```

### Frontend structure

The frontend uses Vue 3, Vite and TypeScript:

- `src/App.vue` lays out the page; the header and footer are in `src/layouts/`.
- `src/sections/` is grouped by feature: picker, prices, comparison, cost calculator, benchmarks, watchlist, contributions and site notes.
- Components and composables shared across sections are in `src/components/` and `src/composables/`.
- `src/domain/` holds business rules with no browser dependency.
- `src/state/` manages shared state and the selectors bound to it.
- `src/browser/` wraps the DOM, URL, storage, charts and resource loading.
- `src/application/` coordinates actions that span features, and page startup.
- `src/entries/` holds the separately bundled classic script entries.

Components import from specific modules as needed. `check:architecture` and CI enforce the layer direction, catch dependency cycles and keep test code isolated. Source code, Vue templates and tests all use strict TypeScript, and the structural types of the audit data are shared through `types/catalog.d.ts`. See [Architecture and release](docs/architecture.md#前端结构与迁移).

### Data and generated files

`data/sources/` holds the hand-maintained audit data. Files generated from it are committed together with the source data:

- the catalog, in `src/generated/`;
- on-demand data, maintenance snapshots and RSS, in `data/generated/`.

`catalog:check` keeps the generated files from drifting away from the sources.

### Tests

- Node tool and architecture checks are in `tests/scripts/`, and browser end-to-end cases in `tests/e2e/`.
- TS full-page regressions are in `src/regression/` and their test support in `src/test/`; component tests sit next to their components.
- Formula and data tests import the TypeScript modules directly. Full-page regressions mount the real `App.vue`, and browser regressions use the real release output.
- `npm test` runs the Node suites through `tests/scripts/run.js`, then Vitest.

The old page VM, HTML rendering fixtures and global business getters in the browser have been removed.

### Usage imports

Several usage files can be imported together, as long as one import uses a single daily or monthly granularity. If the granularities are mixed, the page asks you to split the import and keeps the current calculation inputs. Duplicate Claude Code and Codex logs are deduplicated by message or session event. The plan quota comparison separates the conversion of your current workload from the page's reference baseline, and reference volumes are not a promise of usable quota.

### After changing data

Run these three commands in order. Also regenerate the catalog after benchmark summaries change. The full process is in the [data maintenance guide](docs/maintenance.md).

1. `npm run maintenance:build`: generates the maintenance summary, the change RSS, the per-vendor feeds, and the first-screen summary behind the unread badge in the navigation.
2. `npm run catalog:build`
3. `npm run readme:build`: generates the statistics in the Chinese and English READMEs. CI checks them with `readme:check`.

### Styles and configuration

`src/styles/index.css` imports the styles in cascade order: theme, base, page skeleton, cross-section components, features and narrow-screen adjustments. Other locations:

- component-specific styles: each component's `<style scoped>`;
- fonts: `src/assets/fonts/`;
- share images with fixed URLs: `public/`;
- generated RSS: `data/generated/`.

The root `tsconfig.json` lets editors pick the right type configuration for application code, tests, data and tool scripts.

`npm run dev` generates the catalog before it starts. The dev server watches the audit inputs and the dependencies of the classic scripts, and a page refresh picks up the latest resources. Test commands only check that the committed catalog is consistent, and loading the Vite config never modifies source files.

## Disclaimer

<!-- readme-stats:rates -->
Quota units differ between vendors (prompts per 5 hours, tokens per week, requests per day, credits), so they cannot be compared directly; the tables keep the official wording. US dollar prices are converted at 1 USD ≈ 6.69 CNY and Indian rupee prices at 1 INR ≈ 0.069877 CNY (both from the 2026-10-12 European Central Bank reference rates), for chart comparison only. Exports keep both rates with their values, dates and source. Prices follow the vendors' changes; check the official site before buying.
<!-- /readme-stats:rates -->
