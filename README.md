# StatBench

Statistical tests and graphs in the browser: a worksheet, a Stat menu, a Graph menu and a session window for results. No install and no server-side code; everything runs on the page.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8765
```

Then go to http://localhost:8765. An internet connection is needed on first load for the two libraries fetched from a CDN (jStat for distributions, Plotly for charts).

## What it does

**Worksheet** — type, paste from a spreadsheet, or open a CSV. Columns are numeric or text (`-T`); blank cells and `*` are missing values. The worksheet is kept in the browser between visits.

**Stat**

| Group | Analyses |
| --- | --- |
| Basic Statistics | Descriptive statistics, tally, one-sample t and Z, two-sample t (Welch or pooled), paired t, one proportion (exact), two proportions (with Fisher's exact), two variances (F and Levene), correlation (Pearson, Spearman), normality (Anderson–Darling) |
| ANOVA | One-way ANOVA with Tukey comparisons, test for equal variances |
| Regression | Simple and multiple linear regression with VIF, R-sq(pred), unusual observations and residual plots |
| Tables | Chi-square test for association (raw or summarized data) |
| Nonparametrics | One-sample Wilcoxon, Mann-Whitney, Kruskal-Wallis |

**Graph** — scatterplot, matrix plot, histogram (with normal curve), probability plot, boxplot, individual value plot, interval plot, bar chart, pie chart, time series plot. Most accept a grouping column.

## Layout

- `js/stats.js` — the statistical routines, as pure functions over number arrays
- `js/analyses.js` — one definition per analysis or graph: its dialog fields and its output
- `js/sheet.js` — worksheet data model, grid and CSV handling
- `js/app.js` — menus, dialogs and session output

## Accuracy

The results for the built-in sample data were compared against SciPy and NumPy (t-tests, ANOVA, Tukey, Levene, regression, chi-square, exact binomial, Fisher, Anderson–Darling statistic, Mann-Whitney, Wilcoxon, Kruskal-Wallis) and agree to the displayed precision. Mann-Whitney and Wilcoxon p-values use the normal approximation with continuity correction.

All code here is original and the methods are standard textbook ones. The sample data is synthetic.
